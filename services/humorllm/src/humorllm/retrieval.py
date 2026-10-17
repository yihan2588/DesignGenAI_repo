"""Eligibility-first exact retrieval; no approximate-index recall claims."""
from __future__ import annotations

from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import numpy as np

from .annotations import read_jsonl, write_jsonl
from .embeddings import MODEL, REVISION, DIMENSION

CORPUS_VERSION = 'cleancomedy-en-annotations-v2'


def reciprocal_rank_fusion(channels: list[list[str]], k: int = 50) -> list[tuple[str, float]]:
    if k < 1:
        raise ValueError('RRF smoothing must be positive.')
    scores = defaultdict(float)
    for channel in channels:
        for rank, key in enumerate(dict.fromkeys(channel), 1):
            scores[key] += 1/(k+rank)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


def balanced_pool(channels: list[list[str]],limit: int=20) -> list[str]:
    """Round-robin preserves each of four channel's first five before a 20-record cap."""
    if not 1<=limit<=20:raise ValueError('Candidate pool must contain at most twenty records.')
    lists=[list(dict.fromkeys(channel)) for channel in channels];result=[];seen=set()
    for depth in range(max(map(len,lists),default=0)):
        for channel in lists:
            if depth<len(channel) and channel[depth] not in seen:
                result.append(channel[depth]);seen.add(channel[depth])
                if len(result)==limit:return result
    return result


def eligible_examples(rows: list[dict], corpus_version: str, *, production: bool = False) -> list[dict]:
    return [r for r in rows if r.get('allowed_use') is True and r.get('split') == 'train'
            and r.get('language') == 'en' and r.get('corpus_version') == corpus_version
            and not r.get('heldout_overlap', False) and not r.get('duplicate_of')
            and (not production or r.get('production_eligible') is True)]


def prepare_examples(path: Path, *, production: bool = False) -> list[dict]:
    rows = []
    for row in read_jsonl(path):
        a = row['annotation']
        # Research permission here is the user's bounded private experiment, not image/publication clearance.
        review=row['review']
        checked=(review.get('coordinator_reviewed') or (
            review.get('independent_model_reviewed') is True and
            review.get('protocol')=='situational-expansion-luna-v3' and
            row.get('annotation_provenance',{}).get('protocol')=='situational-expansion-luna-v3' and
            bool(row.get('transfer_test')) and bool(row.get('review_transfer_test'))))
        allowed = (a['decision'] == 'include' and not a['risk_flags'] and checked
                   and a['transferability'] in {'situational','wordplay_only'})
        rows.append({**row, 'allowed_use': allowed, 'split': 'train', 'language': 'en',
                     'corpus_version': CORPUS_VERSION,
                     'situation_text': a['situation']+' '+row['setup'],
                     'mechanism_text': a['mechanism']+' '+a['expectation']+' '+a['twist'],
                     'permission_scope': 'private_research'})
    return eligible_examples(rows, CORPUS_VERSION, production=production)


def build_index(input_path: Path, folder: Path, encoder) -> dict:
    rows = prepare_examples(input_path)
    if not rows:
        raise ValueError('No eligible research candidates.')
    folder.mkdir(parents=True, exist_ok=True)
    vectors = {field: encoder.encode([r[key] for r in rows]) for field, key in
               [('full', 'text'), ('situation', 'situation_text'), ('mechanism', 'mechanism_text')]}
    temporary = folder/'vectors.tmp'
    with temporary.open('wb') as file:
        np.savez(file, **vectors)
    temporary.replace(folder/'vectors.npz')
    write_jsonl(folder/'examples.jsonl', rows)
    manifest = {'corpus_version': CORPUS_VERSION, 'source_sha256': hashlib.sha256(input_path.read_bytes()).hexdigest(),
                'examples_sha256': hashlib.sha256((folder/'examples.jsonl').read_bytes()).hexdigest(),
                'vectors_sha256': hashlib.sha256((folder/'vectors.npz').read_bytes()).hexdigest(),
                'model': MODEL, 'revision': REVISION, 'dimensions': DIMENSION, 'normalized': True,
                'rows': len(rows), 'scan': 'exact', 'permission_scope': 'private_research',
                'production_eligible': False, 'heldout_caption_overlap_audit': 'not performed'}
    (folder/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    return manifest


class Retriever:
    def __init__(self, rows: list[dict], vectors: dict[str, np.ndarray], encoder, *, production: bool = False):
        ids = [i for i, row in enumerate(rows) if eligible_examples([row], CORPUS_VERSION, production=production)]
        self.rows = [rows[i] for i in ids]
        self.encoder = encoder
        self.vectors = {}
        for name in ['full', 'situation', 'mechanism']:
            values = np.asarray(vectors[name], dtype=np.float32)
            if values.shape != (len(rows), DIMENSION) or not np.isfinite(values).all():
                raise ValueError('Index vector shape/nonfinite mismatch.')
            if len(values) and not np.allclose(np.linalg.norm(values, axis=1), 1, atol=1e-4):
                raise ValueError('Index vectors are not normalized.')
            self.vectors[name] = values[ids]
        if len({r['id'] for r in self.rows}) != len(self.rows):
            raise ValueError('Duplicate index IDs.')
        self.by_id = {r['id']: r for r in self.rows}
        self.fts = sqlite3.connect(':memory:')
        self.fts.execute('create virtual table docs using fts5(id UNINDEXED, body, tokenize="porter unicode61")')
        self.fts.executemany('insert into docs values (?,?)',
                             [(r['id'],r['situation_text']+' '+r['mechanism_text']+' '+r['text']) for r in self.rows])

    @classmethod
    def load(cls, folder: Path, encoder, *, production: bool = False):
        manifest = json.loads((folder/'manifest.json').read_text())
        if (manifest['model'], manifest['revision'], manifest['dimensions']) != (MODEL, REVISION, DIMENSION):
            raise ValueError('Encoder/index identity mismatch.')
        for key in ['examples', 'vectors']:
            path = folder/('examples.jsonl' if key == 'examples' else 'vectors.npz')
            if hashlib.sha256(path.read_bytes()).hexdigest() != manifest[key+'_sha256']:
                raise ValueError('Corrupt retrieval index: '+key)
        if production and not manifest.get('production_eligible'):
            raise ValueError('Research corpus is not approved for production.')
        with np.load(folder/'vectors.npz', allow_pickle=False) as arrays:
            vectors = {name: arrays[name] for name in arrays.files}
        return cls(read_jsonl(folder/'examples.jsonl'), vectors, encoder, production=production)

    def dense(self, vector: np.ndarray, field: str, limit: int) -> list[tuple[str, float]]:
        if not self.rows:
            return []
        scores = self.vectors[field] @ vector
        order = sorted(range(len(scores)), key=lambda i: (-float(scores[i]), self.rows[i]['id']))[:limit]
        return [(self.rows[i]['id'], float(scores[i])) for i in order]

    def lexical(self, query: str, limit: int = 20) -> list[tuple[str, float]]:
        words = list(dict.fromkeys(re.findall(r'\b\w{2,}\b', query.lower())))[:64]
        if not words or not self.rows:
            return []
        match = ' OR '.join('"'+word+'"' for word in words)
        return [(key,-score) for key,score in self.fts.execute(
            'select id,bm25(docs) as score from docs where docs match ? order by score,id limit ?', (match,limit))]

    def release_lexical(self, entity: str, scene: str, conflict: str = '', limit: int = 5) -> list[tuple[str, float]]:
        from sklearn.feature_extraction.text import TfidfVectorizer
        # Match inspected release: regex substring first, then fit TF-IDF on the query alone.
        # User/entity text is escaped to prevent regex metacharacters becoming executable patterns.
        matched = [r for r in self.rows if entity.strip() and re.search(re.escape(entity), r['text'], re.I)]
        if len(matched) >= limit:
            return [(r['id'],1.0) for r in matched[:limit]]
        query = ' '.join([entity]*4+[scene,conflict])
        vectorizer = TfidfVectorizer(max_features=1000, stop_words='english', ngram_range=(1,3))
        try:
            q = vectorizer.fit_transform([query])
        except ValueError:
            return []
        scores = (vectorizer.transform([r['text'] for r in self.rows]) @ q.T).toarray().ravel()
        # Deliberately preserve the release's reverse-argsort tie behavior in this reference adapter.
        return [(self.rows[i]['id'],float(scores[i])) for i in np.argsort(scores)[::-1][:limit]]

    def candidate_pool(self,query: str,*,mechanism: str='',entity: str='',limit: int=20):
        if not self.rows:return []
        full=self.search(query,mechanism=mechanism,entity=entity,method='full_dense',limit=20)
        hybrid=self.search(query,mechanism=mechanism,entity=entity,method='hybrid',limit=20)
        lexical=list(dict.fromkeys(self.release_lexical(entity,query,mechanism,5)+self.release_lexical(entity,query,mechanism,20)))[:20]
        mv=self.encoder.encode([mechanism or query])[0]
        structural=self.dense(mv,'mechanism',20)
        keys=balanced_pool([[r['id'] for r in full],[r['id'] for r in hybrid],
                            [key for key,_ in lexical],[key for key,_ in structural]],limit)
        return [{'id':key,'rank':rank,'score':None,'method':'balanced',
                 'transferability':self.by_id[key]['annotation']['transferability']} for rank,key in enumerate(keys,1)]

    def search(self, query: str, *, mechanism: str = '', method: str = 'hybrid', entity: str = '',
               limit: int = 5, query_vector: np.ndarray | None = None, mechanism_vector: np.ndarray | None = None) -> list[dict]:
        if method not in {'release_lexical','full_dense','hybrid','balanced'} or not 1 <= limit <= 20:
            raise ValueError('Invalid retrieval method/limit.')
        if not self.rows:
            return []
        if method == 'balanced':return self.candidate_pool(query,mechanism=mechanism,entity=entity,limit=limit)
        if method == 'release_lexical':
            ranking = self.release_lexical(entity,query,mechanism,limit)
        else:
            vector = self.encoder.encode([query+(' '+mechanism if method=='full_dense' and mechanism else '')])[0] if query_vector is None else query_vector
            if method == 'full_dense':
                ranking = self.dense(vector,'full',limit)
            else:
                mv = self.encoder.encode([mechanism or query])[0] if mechanism_vector is None else mechanism_vector
                channels = [self.lexical(query+' '+mechanism,20), self.dense(vector,'situation',20), self.dense(mv,'mechanism',20)]
                ranking = reciprocal_rank_fusion([[key for key,_ in c] for c in channels])[:limit]
        return [{'id':key,'score':score,'rank':i,'method':method,
                 'transferability':self.by_id[key]['annotation']['transferability']} for i,(key,score) in enumerate(ranking,1)]

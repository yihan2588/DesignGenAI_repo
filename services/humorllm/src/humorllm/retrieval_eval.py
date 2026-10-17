"""Frozen retrieval comparison, method-hidden judging packet, and pooled metrics."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import time
from .annotations import read_jsonl, write_jsonl
from .embeddings import Encoder
from .retrieval import Retriever

METHODS = ['release_lexical', 'full_dense', 'hybrid']


def pool(index: Path, cache: Path, queries: Path, output: Path):
    output.mkdir(parents=True, exist_ok=True)
    if (output/'blind-pool.jsonl').exists():
        raise ValueError('Frozen pool exists; choose a new experiment directory.')
    encoder = Encoder(cache, local_only=True)
    retriever = Retriever.load(index, encoder)
    cases = read_jsonl(queries)
    # All methods receive the same scene, conflict and requested mechanism information.
    descriptions = [r['scene']+' '+r['conflict'] for r in cases]
    mechanisms = [r['mechanism'] for r in cases]
    full_vectors = encoder.encode([d+' '+m for d,m in zip(descriptions,mechanisms)])
    scene_vectors = encoder.encode(descriptions)
    mechanism_vectors = encoder.encode(mechanisms)
    rankings, blind, mapping = [], [], []
    for i,case in enumerate(cases):
        methods = {}
        for method in METHODS:
            started = time.perf_counter()
            hits = retriever.search(descriptions[i], mechanism=mechanisms[i], entity=case['entity'], method=method,
                                    query_vector=full_vectors[i] if method == 'full_dense' else scene_vectors[i],
                                    mechanism_vector=mechanism_vectors[i])
            methods[method] = {'hits':hits,'search_ms_excluding_encoding':(time.perf_counter()-started)*1000}
        keys = {h['id'] for result in methods.values() for h in result['hits']}
        ordered = sorted(keys,key=lambda key: hashlib.sha256(('pool-v1:'+case['id']+key).encode()).hexdigest())
        items = []
        for n,key in enumerate(ordered,1):
            token = case['id']+f'-p{n:02d}'
            row = retriever.by_id[key]
            items.append({'item':token,'text':row['text'],'situation':row['annotation']['situation'],
                          'twist':row['annotation']['twist'],'transferability':row['annotation']['transferability']})
            mapping.append({'item':token,'query_id':case['id'],'source_id':key})
        blind.append({'query':case,'items':items})
        rankings.append({'query_id':case['id'],'methods':methods})
    write_jsonl(output/'blind-pool.jsonl',blind)
    write_jsonl(output/'pool-key.jsonl',mapping)
    write_jsonl(output/'rankings.jsonl',rankings)
    (output/'manifest.json').write_text(json.dumps({'query_sha256':hashlib.sha256(queries.read_bytes()).hexdigest(),
        'index':json.loads((index/'manifest.json').read_text()),'queries':len(cases),'pooled_items':len(mapping),
        'blind_packet_sha256':hashlib.sha256((output/'blind-pool.jsonl').read_bytes()).hexdigest(),
        'judgments':'pending','methods':METHODS},indent=2)+'\n')
    print(json.dumps({'queries':len(cases),'pooled_items':len(mapping),'judgments':'pending'}))


def score(output: Path, labels: Path):
    mapping = read_jsonl(output/'pool-key.jsonl')
    labeled = read_jsonl(labels)
    if len({r['item'] for r in labeled}) != len(labeled) or {r['item'] for r in labeled} != {r['item'] for r in mapping}:
        raise ValueError('Labels must cover each blind item exactly once.')
    if any(type(r['grade']) is not int or r['grade'] not in {0,1,2} or not r.get('reason') for r in labeled):
        raise ValueError('Each label needs an integer grade 0/1/2 and reason.')
    labels_by_id = {r['item']:r['grade'] for r in labeled}
    grades = {(r['query_id'],r['source_id']):labels_by_id[r['item']] for r in mapping}
    cases = {r['query']['id']:r['query'] for r in read_jsonl(output/'blind-pool.jsonl')}
    metrics = {m:[] for m in METHODS}
    per_query = []
    dcg = lambda values:sum((2**v-1)/math.log2(i+2) for i,v in enumerate(values))
    for row in read_jsonl(output/'rankings.jsonl'):
        q = row['query_id']; ideal = dcg(sorted([g for (query,_),g in grades.items() if query==q],reverse=True)[:5])
        result = {'query_id':q,'stratum':cases[q]['stratum'],'methods':{}}
        for method,data in row['methods'].items():
            values = [grades[q,h['id']] for h in data['hits']]
            record = {'hit_at_5':int(2 in values),'precision_at_5':sum(v==2 for v in values)/5,
                      'pooled_ndcg_at_5':dcg(values)/ideal if ideal else 0.0,
                      'returned':len(values),'search_ms_excluding_encoding':data['search_ms_excluding_encoding']}
            metrics[method].append(record);result['methods'][method] = record
        per_query.append(result)
    means = {m:{k:sum(r[k] for r in values)/len(values) for k in values[0]} for m,values in metrics.items()}
    # Prefer the simpler dense method on a tie; this is a development choice, never a held-out claim.
    selected = max(['full_dense','hybrid','release_lexical'],key=lambda m:(means[m]['hit_at_5'],means[m]['precision_at_5']))
    summary = {'queries':len(cases),'pooled_items':len(mapping),'metrics':means,'development_choice':selected,
               'target_hit_at_5':0.8,'ai_triage_target_met':means[selected]['hit_at_5']>=0.8,
               'human_quality_gate_passed':False,'hnsw_used':False,'true_recall_measured':False,
               'judging':'Gemini 3.1 Flash-Lite; methods/ranks hidden. Query author knew the corpus; separate coordinator audit.',
               'limitations':['Synthetic text queries, not actual image-grounding or humor judgments.',
                              'Labels are AI triage, not human gold or independent ratings.',
                              'Pooled nDCG uses only the union of retrieved top-five lists, not exhaustive corpus relevance.',
                              'Search timings exclude encoding and initial loading; not end-to-end latency.',
                              'Do not expand to 10000 or enable production solely from these scores.'],
               'labels_sha256':hashlib.sha256(labels.read_bytes()).hexdigest()}
    write_jsonl(output/'per-query-metrics.jsonl',per_query)
    (output/'results.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__);sub = parser.add_subparsers(dest='command',required=True)
    p = sub.add_parser('pool')
    for name in ['index','cache','queries','output']:p.add_argument('--'+name,type=Path,required=True)
    p = sub.add_parser('score');p.add_argument('--output',type=Path,required=True);p.add_argument('--labels',type=Path,required=True)
    args = vars(parser.parse_args());command = args.pop('command')
    (pool if command=='pool' else score)(**args)


if __name__ == '__main__':main()

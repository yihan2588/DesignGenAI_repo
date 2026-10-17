"""Prepare private Vercel build inputs from the frozen, reviewed index.

Run from the repository root. No model calls or new annotations are made.
"""
import csv,hashlib,json,shutil,unicodedata
from pathlib import Path
import sys
import numpy as np
sys.path.insert(0,str(Path(__file__).parent/'src'))
from humorllm.annotations import read_jsonl,write_jsonl,validate_annotation
from humorllm.rank import copy_score,tokens
from humorllm.retrieval import Retriever

root=Path(__file__).resolve().parents[2]
original=root/'.local/humorllm/retrieval/index'
hosted=root/'services/humorllm/hosted'
manifest=json.loads((original/'manifest.json').read_text())
for name in ['examples','vectors']:
 p=original/('examples.jsonl' if name=='examples' else 'vectors.npz')
 assert hashlib.sha256(p.read_bytes()).hexdigest()==manifest[name+'_sha256']
rows=read_jsonl(original/'examples.jsonl')
assert len(rows)==manifest['rows'] and len({r['id'] for r in rows})==len(rows)
assert len({r['text_sha256'] for r in rows})==len(rows)
for r in rows:
 assert hashlib.sha256(r['text'].encode()).hexdigest()==r['text_sha256']
 validate_annotation(r['annotation'],r)
 review=r['review']
 assert review.get('coordinator_reviewed') or (review.get('independent_model_reviewed') and r.get('transfer_test') and r.get('review_transfer_test'))
 assert r['allowed_use'] and r['split']=='train' and not r.get('heldout_overlap') and not r.get('duplicate_of')
 assert r['annotation']['decision']=='include' and not r['annotation']['risk_flags']
# Stream every available benchmark caption; use shared five-word spans only to shortlist
# deterministic near-copy checks. This is lexical overlap screening, not a semantic audit.
grams={}
for r in rows:
 words=tokens(r['text'])
 for i in range(len(words)-4):grams.setdefault(tuple(words[i:i+5]),set()).add(r['id'])
by_id={r['id']:r for r in rows};overlap={};screened=0;files=0
benchmark=Path('/private/tmp/humorllm-homer-reference/data/datasets/humorbench/ranking/source')
for p in sorted(benchmark.glob('*.csv')):
 files+=1
 with p.open() as file:
  for item in csv.DictReader(file):
   caption=item['caption'];screened+=1;words=tokens(caption);ids=set()
   for i in range(len(words)-4):ids.update(grams.get(tuple(words[i:i+5]),()))
   for key in ids:
    score=max(copy_score(caption,by_id[key]['text']),copy_score(by_id[key]['text'],caption))
    if score>=.8:overlap.setdefault(key,{'benchmark_file':p.name,'caption_sha256':hashlib.sha256(caption.encode()).hexdigest(),'score':score})
assert files and screened
selected=[i for i,r in enumerate(rows) if r['id'] not in overlap]
production=[]
for i in selected:
 r={**rows[i],'production_eligible':True,'permission_scope':'public_app_demo_retrieval'}
 # This is operator/source-use qualification for the requested deployment, not human humor review.
 r['release_review']={'scope':'User-authorized app deployment; source repository declares CC-BY-4.0; original jokes remain private.',
   'source':'https://github.com/gorovuha/CleanComedy','license':'https://creativecommons.org/licenses/by/4.0/',
   'attribution':'gorovuha/CleanComedy contributors','changes':'AI annotations and new image-caption adaptations',
   'individual_rights_audit':False,'human_humor_review':False}
 production.append(r)
target=hosted/'private_index';target.mkdir(parents=True,exist_ok=True)
write_jsonl(target/'examples.jsonl',production)
with np.load(original/'vectors.npz',allow_pickle=False) as arrays:
 with (target/'vectors.npz').open('wb') as file:np.savez(file,**{name:arrays[name][selected] for name in arrays.files})
release={**manifest,'examples_sha256':hashlib.sha256((target/'examples.jsonl').read_bytes()).hexdigest(),
 'vectors_sha256':hashlib.sha256((target/'vectors.npz').read_bytes()).hexdigest(),'rows':len(production),
 'permission_scope':'public_app_demo_retrieval','production_eligible':True,
 'heldout_caption_overlap_audit':{'method':'shared five-word spans followed by bidirectional copy_score >= 0.8','benchmark_files':files,'captions_screened':screened,'excluded_ids':sorted(overlap)},
 'research_index_examples_sha256':manifest['examples_sha256'],'source_use_review':production[0]['release_review']}
(target/'manifest.json').write_text(json.dumps(release,indent=2)+'\n')
shutil.copytree(root/'services/humorllm/src/humorllm',hosted/'humorllm',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
receipt={'production_sources':len(production),'research_sources':len(rows),'overlap_exclusions':overlap,'captions_screened':screened,
 'approved_identity_pairs':[[r['id'],r['text_sha256']] for r in production],
 'index_manifest_sha256':hashlib.sha256((target/'manifest.json').read_bytes()).hexdigest()}
(root/'.local/humorllm/launch-20261016/corpus-release.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='approved_identity_pairs'},indent=2))

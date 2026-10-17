"""Preserved paired retrieval regression: balanced shortlist, grounded rerank, blind rejudging."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import time
from .annotations import read_jsonl,write_jsonl
from .embeddings import Encoder
from .providers import Gemini,load_environment
from .retrieval import Retriever
from .supabase import Supabase,RemoteRetriever
from .rerank import rerank,VERSION,resolved_evidence
from .store import Ledger

METHODS=['release_lexical','full_dense','hybrid','balanced','balanced_rerank']


def prepare(args):
    folder=args.output;folder.mkdir(parents=True,exist_ok=True)
    load_environment(args.env)
    queries=read_jsonl(args.queries)
    if not 1<=len(queries)<=70:raise ValueError('Evaluation is bounded to 70 queries.')
    manifest={'queries_sha256':hashlib.sha256(args.queries.read_bytes()).hexdigest(),'query_count':len(queries),
        'index':json.loads((args.index/'manifest.json').read_text()),'backend':args.backend,'reranker_version':VERSION,
        'reranker_sha256':hashlib.sha256((Path(__file__).parent/'rerank.py').read_bytes()).hexdigest(),
        'retrieval_sha256':hashlib.sha256((Path(__file__).parent/'retrieval.py').read_bytes()).hexdigest(),
        'remote_sha256':hashlib.sha256((Path(__file__).parent/'supabase.py').read_bytes()).hexdigest(),
        'methods':METHODS,'candidate_cap':20,'output_cap':5,'frozen_before_calls':True,
        'evaluation_status':'Development rerun; same-model selector/judge, no human gold; no held-out performance claim.'}
    identity=folder/'manifest.json'
    if identity.exists() and json.loads(identity.read_text())!=manifest:raise ValueError('Frozen experiment changed; choose a new folder.')
    identity.write_text(json.dumps(manifest,indent=2)+'\n')
    encoder=Encoder(args.state/'embeddings',local_only=True)
    local=Retriever.load(args.index,encoder);r=local
    if args.backend=='supabase':r=RemoteRetriever(local,Supabase(os.getenv('SUPABASE_URL'),os.getenv('SUPABASE_ANON_KEY'),os.getenv('HUMOR_WORKER_KEY')))
    calls=folder/'rerank-calls';calls.mkdir(exist_ok=True)
    # Retrieval/SQLite stays on the main thread. Only stateless provider calls use threads.
    work=[]
    for q in queries:
        target=calls/(q['id']+'.json')
        if target.exists():continue
        text=q['scene']+' '+q['conflict'];base={}
        for method in METHODS[:3]:
            t=time.perf_counter()
            hits=local.search(text,mechanism=q['mechanism'],entity=q['entity'],method=method) if method=='release_lexical' else r.search(text,mechanism=q['mechanism'],entity=q['entity'],method=method)
            base[method]={'hits':hits,'elapsed_ms':round((time.perf_counter()-t)*1000)}
        pool=r.candidate_pool(text,mechanism=q['mechanism'],entity=q['entity'])
        base['balanced']={'hits':pool[:5]}
        work.append((q,base,pool))
    with Ledger(args.state/'usage.sqlite',25) as ledger:
        provider=Gemini(os.getenv('GEMINI_API_KEY',''),ledger)
        def select(item):
            q,base,pool=item;rows=[r.by_id[x['id']] for x in pool];steps=[];repair_note=''
            # Parse/reference failures can repair once; provider/quota errors stop this query.
            for attempt in range(2):
                try:
                    order,step=rerank(provider,rows,q['scene'],q['conflict'],q['mechanism'],stage='ranking_eval:'+q['id'],repair_note=repair_note)
                    if step:steps.append(step)
                    hits=[{'id':x.source_id,'rank':i,'method':'balanced_rerank','reranker_grade':x.grade,
                           'transferability':r.by_id[x.source_id]['annotation']['transferability']} for i,x in enumerate(order.ranking,1)]
                    base['balanced_rerank']={'hits':hits,'selection':order.model_dump(mode='json'),
                         'evidence':resolved_evidence(order,{row['id']:row for row in rows},q['scene'])}
                    value={'query':q,'methods':base,'candidate_ids':[x['id'] for x in pool],'steps':steps}
                    temp=calls/(q['id']+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(calls/(q['id']+'.json'))
                    print(q['id']+' reranked',flush=True);return
                except Exception as failure:
                    if hasattr(failure,'step'):steps.append(failure.step)
                    (calls/(q['id']+'-failure.json')).write_text(json.dumps({'steps':steps,'error_type':type(failure).__name__},indent=2)+'\n')
                    if type(failure).__name__=='ProviderFailure':raise
                    if attempt:
                        # A malformed rerank is a counted failed query, never silently removed from metrics.
                        base['balanced_rerank']={'hits':[],'failure':type(failure).__name__}
                        value={'query':q,'methods':base,'candidate_ids':[x['id'] for x in pool],'steps':steps}
                        (calls/(q['id']+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
                        print(q['id']+' rerank failed validation',flush=True);return
                    repair_note='\nRepair once: '+str(failure)[:240]+'. Use only supplied source_excerpt_id and visual_anchor_id values for grade 2; creative conflict is not observed evidence.'
        if work:
            select(work[0])
            with ThreadPoolExecutor(max_workers=3) as executor:list(executor.map(select,work[1:]))
        rankings=[];packets=[];mapping=[]
        for q in queries:
            data=json.loads((calls/(q['id']+'.json')).read_text());rankings.append({'query_id':q['id'],'methods':data['methods'],'candidate_ids':data['candidate_ids']})
            keys={h['id'] for method in data['methods'].values() for h in method['hits']}
            ordered=sorted(keys,key=lambda key:hashlib.sha256(('ranking-eval-v2:'+q['id']+key).encode()).hexdigest())
            for b in range(0,len(ordered),12):
                packet=q['id']+f'-b{b//12+1:02d}';items=[]
                for i,key in enumerate(ordered[b:b+12],1):
                    row=r.by_id[key];token=packet+f'-i{i:02d}'
                    items.append({'item':token,'text':row['text'],'situation':row['annotation']['situation'],
                                  'twist':row['annotation']['twist'],'transferability':row['annotation']['transferability']})
                    mapping.append({'item':token,'query_id':q['id'],'source_id':key})
                packets.append({'query':{**q,'id':packet},'items':items})
        write_jsonl(folder/'rankings.jsonl',rankings);write_jsonl(folder/'blind-pool.jsonl',packets);write_jsonl(folder/'pool-key.jsonl',mapping)
        print(json.dumps({'ranked_queries':len(rankings),'judging_packets':len(packets),'pooled_pairs':len(mapping),'ledger_usd':ledger.total()}))


def score(args):
    from math import log2
    folder=args.output;mapping=read_jsonl(folder/'pool-key.jsonl');labels=read_jsonl(folder/'gemini-labels.jsonl')
    if len({r['item'] for r in labels})!=len(labels) or {r['item'] for r in labels}!={r['item'] for r in mapping}:raise ValueError('Incomplete judgment coverage.')
    by_item={r['item']:r['grade'] for r in labels};grade={(r['query_id'],r['source_id']):by_item[r['item']] for r in mapping}
    records=read_jsonl(folder/'rankings.jsonl');out=[]
    dcg=lambda vals:sum((2**v-1)/log2(i+2) for i,v in enumerate(vals))
    for r in records:
        q=r['query_id'];ideal=dcg(sorted([v for (key,_),v in grade.items() if key==q],reverse=True)[:5]);methods={}
        for name,data in r['methods'].items():
            vals=[grade[q,h['id']] for h in data['hits']]
            methods[name]={'hit_at_5':int(2 in vals),'precision_at_5':sum(v==2 for v in vals)/5,
                           'pooled_ndcg_at_5':dcg(vals)/ideal if ideal else 0,'returned':len(vals)}
        admitted=[h for h in r['methods']['balanced_rerank']['hits'] if h['reranker_grade']==2]
        admitted_usable=sum(grade[q,h['id']]==2 for h in admitted)
        admission={'hit_at_5':int(admitted_usable>0),'precision_at_5':admitted_usable/5,
                   'count':len(admitted),'judged_usable':admitted_usable}
        out.append({'query_id':q,'methods':methods,'admission':admission})
    def means(rows):return {m:{k:sum(r['methods'][m][k] for r in rows)/len(rows) for k in rows[0]['methods'][m]} for m in METHODS}
    groups={'frozen_50':[r for r in out if r['query_id'].startswith('q')],
            'new_validation_20':[r for r in out if r['query_id'].startswith('v')]}
    admission={name:{'hit_at_5':sum(r['admission']['hit_at_5'] for r in rows)/len(rows),
        'precision_at_5':sum(r['admission']['precision_at_5'] for r in rows)/len(rows),
        'admitted_total':sum(r['admission']['count'] for r in rows),
        'judged_usable_total':sum(r['admission']['judged_usable'] for r in rows),
        'conditional_precision':sum(r['admission']['judged_usable'] for r in rows)/max(1,sum(r['admission']['count'] for r in rows))}
        for name,rows in groups.items() if rows}
    result={'admission_metrics':admission,'contract_failure_queries':[r['query_id'] for r in records if r['methods']['balanced_rerank'].get('failure')],
        'metrics':{name:means(rows) for name,rows in groups.items() if rows},'pooled_pairs':len(mapping),
        'original_labels_preserved':True,'new_method_hidden_judgments':True,'same_model_selector_and_judge':True,
        'human_quality_gate_passed':False,'heldout_performance_claim':False,
        'judge_labels_sha256':hashlib.sha256((folder/'gemini-labels.jsonl').read_bytes()).hexdigest(),
        'limitations':['Known-miss development fixes; original 50 is now a development set.',
                       'Same Gemini model selects and grades; correlated errors may inflate improvements.',
                       'New 20 text scenarios were frozen before implementation but their author knew the corpus.',
                       'Scores require independent human grounding/usefulness validation; no humor gain claim.']}
    write_jsonl(folder/'per-query-metrics.jsonl',out);(folder/'results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['prepare','score']);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--queries',type=Path);p.add_argument('--state',type=Path,default=Path('.local/humorllm'))
    p.add_argument('--index',type=Path,default=Path('.local/humorllm/retrieval/index'));p.add_argument('--env',type=Path,default=Path('.env.local'))
    p.add_argument('--backend',choices=['local','supabase'],default='local');a=p.parse_args()
    (prepare if a.command=='prepare' else score)(a)

if __name__=='__main__':main()

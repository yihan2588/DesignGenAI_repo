"""One CLI for embeddings, single-image runs, and frozen bounded pilots."""
from __future__ import annotations
import argparse
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import re

from .annotations import read_jsonl
from .embeddings import Encoder
from .images import sanitize_image
from .pipeline import Pipeline,PipelineConfig
from .providers import Gemini,load_environment,MODEL,RATES
from .retrieval import Retriever,build_index
from .store import Ledger,RunStore


def save_result(folder: Path,run_id,result):
    folder.mkdir(parents=True,exist_ok=True)
    temporary=folder/(run_id+'.tmp');target=folder/(run_id+'.json')
    contents=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if target.exists() and target.read_text()!=contents:
        previous=json.loads(target.read_text())
        if previous.get('status') in {'ready','degraded'} and result.get('fingerprint')!=previous.get('fingerprint'):
            raise ValueError('Refusing to replace a completed artifact with a different or invalid run.')
        archive=folder/'history';archive.mkdir(exist_ok=True)
        snapshot=archive/(run_id+'-'+hashlib.sha256(target.read_bytes()).hexdigest()+'.json')
        if not snapshot.exists():snapshot.write_bytes(target.read_bytes())
    temporary.write_text(contents);temporary.replace(target)


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    embed=sub.add_parser('embed');embed.add_argument('--corpus',type=Path,required=True)
    embed.add_argument('--index',type=Path,default=Path('.local/humorllm/retrieval/index'))
    embed.add_argument('--state',type=Path,default=Path('.local/humorllm'))
    for name in ['run','pilot']:
        p=sub.add_parser(name)
        p.add_argument('--state',type=Path,default=Path('.local/humorllm'))
        p.add_argument('--index',type=Path,default=Path('.local/humorllm/retrieval/index'))
        p.add_argument('--env',type=Path,default=Path('.env.local'))
        p.add_argument('--model',choices=sorted(RATES),default=MODEL)
        p.add_argument('--backend',choices=['local','supabase'],default='local')
        p.add_argument('--retrieval',choices=['full_dense','hybrid','release_lexical','balanced_rerank'],default='full_dense')
        if name=='run':p.add_argument('--image',type=Path,required=True);p.add_argument('--run-id',required=True)
        else:p.add_argument('--manifest',type=Path,required=True);p.add_argument('--prefix',required=True)
    args=parser.parse_args();args.state.mkdir(parents=True,exist_ok=True)
    encoder=Encoder(args.state/'embeddings',local_only=args.command!='embed')
    if args.command=='embed':
        print(json.dumps(build_index(args.corpus,args.index,encoder),indent=2));return
    load_environment(args.env)
    if not os.getenv('GEMINI_API_KEY'):parser.error('GEMINI_API_KEY is absent from environment/configured env file.')
    retriever=Retriever.load(args.index,encoder)
    if args.backend=='supabase':
        from .supabase import Supabase,RemoteRetriever
        retriever=RemoteRetriever(retriever,Supabase(os.getenv('SUPABASE_URL'),os.getenv('SUPABASE_ANON_KEY'),os.getenv('HUMOR_WORKER_KEY')))
    cases=[{'id':args.run_id,'path':str(args.image)}] if args.command=='run' else read_jsonl(args.manifest)
    if len(cases)>20:parser.error('A qualification invocation is capped at 20 cases.')
    manifest_sha=hashlib.sha256(args.manifest.read_bytes()).hexdigest() if args.command=='pilot' else None
    outcomes=[]
    with ExitStack() as stack:
        ledger=stack.enter_context(Ledger(args.state/'usage.sqlite',25))
        store=stack.enter_context(RunStore(args.state/'runs.sqlite'))
        provider=Gemini(os.environ['GEMINI_API_KEY'],ledger,model=args.model)
        pipeline=Pipeline(provider,retriever,store,PipelineConfig(retrieval_method=args.retrieval))
        for case in cases:
            run_id=(args.prefix+'-'+case['id']) if args.command=='pilot' else case['id']
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',run_id):parser.error('Run ID must contain 1–100 letters/digits/underscores/hyphens.')
            try:
                raw=Path(case['path']).read_bytes()
                if case.get('sha256') and hashlib.sha256(raw).hexdigest()!=case['sha256']:raise ValueError('Input image checksum mismatch.')
                image=sanitize_image(raw)
                result=pipeline.run(run_id,image)
            except Exception as failure:
                result={'status':'failed','error_type':type(failure).__name__,'error_category':'input_or_run_unavailable'}
            save_result(args.state/'runs',run_id,result)
            outcome={'run_id':run_id,'status':result['status'],'error_type':result.get('error_type'),
                     'elapsed_ms':result.get('elapsed_ms'),'successful_steps':sum('output' in s and not s.get('validation_failure') and not s.get('error') for s in result.get('steps',[]))}
            outcomes.append(outcome);print(json.dumps(outcome),flush=True)
        summary={'cases':outcomes,'ledger_committed_or_reserved_usd':ledger.total(),
                 'manifest_sha256':manifest_sha,'quality_claim':'Technical qualification only; no human preference result.'}
        save_result(args.state/'runs',args.prefix+'-summary' if args.command=='pilot' else args.run_id+'-summary',summary)
        print(json.dumps(summary,indent=2))
        if any(r['status']=='failed' for r in outcomes):raise SystemExit(1)
        if any(r['status']=='degraded' for r in outcomes):raise SystemExit(2)


if __name__=='__main__':main()

"""Single-process worker with durable database leases and restartable local state."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import signal
import time
import uuid
from .cli import save_result
from .embeddings import Encoder
from .images import sanitize_image
from .pipeline import Pipeline,PipelineConfig
from .providers import Gemini,load_environment,MODEL
from .retrieval import Retriever,CORPUS_VERSION
from .store import RunStore
from .supabase import Supabase,RemoteLedger,RemoteRetriever,ingest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['ingest','work'])
    parser.add_argument('--env',type=Path,default=Path('.env.local'))
    parser.add_argument('--index',type=Path,default=Path('.local/humorllm/retrieval/index'))
    parser.add_argument('--state',type=Path,default=Path('.local/humorllm'))
    parser.add_argument('--once',action='store_true')
    args=parser.parse_args();load_environment(args.env)
    client=Supabase(os.getenv('SUPABASE_URL'),os.getenv('SUPABASE_ANON_KEY'),os.getenv('HUMOR_WORKER_KEY'))
    encoder=Encoder(args.state/'embeddings',local_only=True)
    # Work refuses the current research index before announcing a healthy production worker.
    local=Retriever.load(args.index,encoder,production=args.command=='work')
    if args.command=='ingest':print(json.dumps({'inserted':ingest(client,local)}));return
    if not os.getenv('GEMINI_API_KEY'):parser.error('GEMINI_API_KEY is required.')
    args.state.mkdir(parents=True,exist_ok=True)
    id_path=args.state/'worker-id'
    if not id_path.exists():id_path.write_text(str(uuid.uuid4()))
    worker=str(uuid.UUID(id_path.read_text().strip()));stop=False
    def shutdown(*_):
        nonlocal stop
        stop=True  # Finish the current bounded call/run, then stop claiming jobs.
    signal.signal(signal.SIGTERM,shutdown);signal.signal(signal.SIGINT,shutdown)
    with RunStore(args.state/'worker-runs.sqlite') as store:
        while not stop:
            job=client.rpc('humor_worker_claim',p_worker=worker)
            if not job:
                if args.once:return
                time.sleep(5);continue
            run,token=job['run_id'],job['lease_token']
            try:
                cfg=job['config']
                if cfg.get('model')!=MODEL or cfg.get('corpus_version')!=CORPUS_VERSION:raise ValueError('Unqualified worker configuration.')
                def checkpoint(stage,value):
                    client.rpc('humor_worker_checkpoint',p_run=run,p_token=token,p_stage=stage,p_value=value)
                    client.rpc('humor_worker_ping',p_worker=worker)
                provider=Gemini(os.environ['GEMINI_API_KEY'],RemoteLedger(client,run,token))
                pipeline=Pipeline(provider,RemoteRetriever(local,client,production=True),store,
                    PipelineConfig(retrieval_method=cfg['retrieval_method']),on_checkpoint=checkpoint,resume=job)
                image=sanitize_image(client.download(job['owner_id'],job['storage_path']))
                result=pipeline.run(run,image)
                result.update({'corpus_version':CORPUS_VERSION,'production_eligible':True})
                save_result(args.state/'worker-results',run,result)
                client.rpc('humor_worker_finish',p_run=run,p_token=token,p_result=result)
                print(json.dumps({'run_id':run,'status':result['status']}),flush=True)
            except Exception as failure:
                # RPC failure stops this process. Lease expiry/reclaim preserves checkpoints and unknown costs.
                print(json.dumps({'run_id':run,'status':'interrupted','error_type':type(failure).__name__}),flush=True)
                raise SystemExit(1) from None
            if args.once:return


if __name__=='__main__':main()

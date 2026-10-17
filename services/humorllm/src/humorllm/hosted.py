"""Request-driven worker. Supabase owns leases, checkpoints and cost reservations."""
from __future__ import annotations
import hmac
import json
import os
from pathlib import Path
import threading
import uuid
from .images import sanitize_image
from .pipeline import Pipeline,PipelineConfig
from .providers import Gemini,MODEL
from .retrieval import Retriever,CORPUS_VERSION
from .store import RunStore
from .supabase import Supabase,RemoteLedger,RemoteRetriever


class HostedWorker:
    def __init__(self,index:Path,encoder_cache:Path,*,client=None,encoder=None,provider_factory=Gemini):
        self.index,self.encoder_cache=index,encoder_cache
        self.client=client or Supabase(os.getenv('SUPABASE_URL'),os.getenv('SUPABASE_ANON_KEY'),os.getenv('HUMOR_WORKER_KEY'))
        self.encoder=encoder
        self.provider_factory=provider_factory
        self._load_lock=threading.Lock()
        self._slots=threading.BoundedSemaphore(2)

    def authorized(self,key):
        expected=os.getenv('HUMOR_WORKER_KEY','')
        return len(expected)>=32 and isinstance(key,str) and hmac.compare_digest(key,expected)

    def local_retriever(self):
        with self._load_lock:
            if self.encoder is None:
                from .embeddings import Encoder
                # Packaged model is immutable. Only content-addressed query caches use /tmp.
                self.encoder=Encoder(self.encoder_cache,local_only=True,query_cache=Path('/tmp/humorllm-embeddings'))
            # Per-request FTS connection avoids sharing SQLite handles between HTTP threads.
            return Retriever.load(self.index,self.encoder,production=True)

    def run(self,run_id):
        run=str(uuid.UUID(run_id))
        if not self._slots.acquire(blocking=False):return {'status':'busy'},429
        try:
            local=self.local_retriever()
            worker=str(uuid.uuid4())
            job=self.client.rpc('humor_worker_claim_run',p_worker=worker,p_run=run)
            if not job:return {'status':'busy'},409
            if job.get('terminal'):return {'status':job['status'],'reused':True},200
            token=job['lease_token'];cfg=job['config']
            if cfg.get('model')!=MODEL or cfg.get('corpus_version')!=CORPUS_VERSION or cfg.get('retrieval_method')!='balanced_rerank':
                raise ValueError('Unqualified hosted worker configuration.')
            def checkpoint(stage,value):
                self.client.rpc('humor_worker_checkpoint',p_run=run,p_token=token,p_stage=stage,p_value=value)
                self.client.rpc('humor_worker_ping',p_worker=worker)
            image=sanitize_image(self.client.download(job['owner_id'],job['storage_path']))
            with RunStore(':memory:') as store:
                provider=self.provider_factory(os.environ['GEMINI_API_KEY'],RemoteLedger(self.client,run,token))
                # Leave time for cold-start/routing/publication within Vercel's 300-second limit.
                result=Pipeline(provider,RemoteRetriever(local,self.client,production=True),store,
                    PipelineConfig(retrieval_method='balanced_rerank',deadline_seconds=250),
                    on_checkpoint=checkpoint,resume=job).run(run,image)
                result.update(corpus_version=CORPUS_VERSION,production_eligible=True)
                self.client.rpc('humor_worker_finish',p_run=run,p_token=token,p_result=result)
            return {'status':result['status'],'run_id':run,'guided_mode':result.get('guided_mode')},200
        finally:self._slots.release()

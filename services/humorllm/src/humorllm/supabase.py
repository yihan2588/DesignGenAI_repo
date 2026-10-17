"""Capability-scoped RPC client. No service-role key or arbitrary SQL execution."""
from __future__ import annotations
import json
import re
from urllib import request,error,parse
import numpy as np
from .retrieval import CORPUS_VERSION,balanced_pool


class WorkerUnavailable(RuntimeError):pass


class Supabase:
    def __init__(self,url,anon_key,worker_key,*,transport=None):
        if not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co',url or ''):raise ValueError('Expected an HTTPS Supabase project URL.')
        if not anon_key or not 32<=len(worker_key or '')<=256:raise ValueError('Missing worker credentials.')
        self.url,self.anon_key,self.key,self.transport=url,anon_key,worker_key,transport

    def rpc(self,name,**payload):
        if name not in {'humor_worker_ping','humor_worker_claim','humor_worker_claim_run','humor_worker_checkpoint','humor_worker_finish',
                        'humor_worker_reserve','humor_worker_settle','humor_worker_export_batch','humor_retrieval_search','humor_ingest_examples'}:
            raise ValueError('RPC is outside the worker capability.')
        payload={'p_key':self.key,**payload}
        if self.transport:return self.transport(name,payload)
        req=request.Request(self.url+'/rest/v1/rpc/'+name,data=json.dumps(payload).encode(),method='POST',headers={
            'Content-Type':'application/json','apikey':self.anon_key,'Authorization':'Bearer '+self.anon_key})
        try:
            with request.urlopen(req,timeout=30) as response:
                raw=response.read(2000001)
                if len(raw)>2000000:raise WorkerUnavailable('Worker response exceeded size limit.')
                return json.loads(raw) if raw else None
        except (error.HTTPError,error.URLError,TimeoutError,OSError):
            raise WorkerUnavailable('Worker RPC failed; inspect the private server logs.') from None

    def download(self,owner,path):
        if not re.fullmatch(r'[0-9a-f-]{36}',owner) or not re.fullmatch(re.escape(owner)+r'/[0-9a-f-]{36}\.jpg',path):
            raise ValueError('Invalid owned image path.')
        # Fixed project/bucket and UUID path prevent arbitrary URL requests. Bucket is public in the existing app.
        req=request.Request(self.url+'/storage/v1/object/public/humor-images/'+parse.quote(path,safe='/'))
        try:
            with request.urlopen(req,timeout=30) as response:raw=response.read(2*1024*1024+1)
        except (error.HTTPError,error.URLError,TimeoutError,OSError):raise WorkerUnavailable('Saved image could not be loaded.') from None
        if len(raw)>2*1024*1024:raise ValueError('Saved image exceeds app limit.')
        return raw


class RemoteLedger:
    """Database reservations enforce the global cap and persistent 12-call limit."""
    def __init__(self,client,run,token):self.client,self.run,self.token=client,run,token
    def reserve(self,amount,stage):
        if amount!=.10:raise ValueError('Unpriced reservation.')
        return self.client.rpc('humor_worker_reserve',p_run=self.run,p_token=self.token,p_stage=stage)
    def settle(self,reservation,actual):
        if actual is None:return
        self.client.rpc('humor_worker_settle',p_run=self.run,p_token=self.token,p_reservation=reservation,p_actual=actual)
        if actual>.10:raise ValueError('Provider cost exceeded reservation; stop scheduling.')


class RemoteRetriever:
    backend = 'supabase-exact-v1'
    def __init__(self,local,client,*,production=False):
        self.local,self.client,self.production=local,client,production
        self.rows,self.by_id,self.encoder,self.vectors=local.rows,local.by_id,local.encoder,local.vectors
    def candidate_pool(self,query,*,mechanism='',entity='',limit=20):
        full=self.search(query,mechanism=mechanism,method='full_dense',limit=20)
        hybrid=self.search(query,mechanism=mechanism,method='hybrid',limit=20)
        eligible={r['id'] for r in full+hybrid}
        lexical=[key for key,_ in dict.fromkeys(self.local.release_lexical(entity,query,mechanism,5)+self.local.release_lexical(entity,query,mechanism,20)) if key in eligible][:20]
        mv=self.encoder.encode([mechanism or query])[0]
        structural=[key for key,_ in self.local.dense(mv,'mechanism',20) if key in eligible]
        keys=balanced_pool([[r['id'] for r in full],[r['id'] for r in hybrid],lexical,structural],limit)
        return [{'id':key,'rank':rank,'score':None,'method':'balanced',
                 'transferability':self.by_id[key]['annotation']['transferability']} for rank,key in enumerate(keys,1)]

    def search(self,query,*,mechanism='',method='hybrid',entity='',limit=5,query_vector=None,mechanism_vector=None):
        if method=='balanced':return self.candidate_pool(query,mechanism=mechanism,entity=entity,limit=limit)
        if method not in {'full_dense','hybrid'}:raise ValueError('Reference lexical retrieval is local only.')
        vector=self.encoder.encode([query+(' '+mechanism if method=='full_dense' and mechanism else '')])[0] if query_vector is None else query_vector
        mv=self.encoder.encode([mechanism or query])[0] if mechanism_vector is None else mechanism_vector
        rows=self.client.rpc('humor_retrieval_search',p_corpus=CORPUS_VERSION,p_query=query+' '+mechanism,
            p_situation=json.dumps(np.asarray(vector).tolist()),p_mechanism=json.dumps(np.asarray(mv).tolist()),
            p_method=method,p_scope='production' if self.production else 'research',p_count=limit)
        result=[]
        for row in rows:
            key=row['source_id']
            if key not in self.by_id or row['text_sha256']!=self.by_id[key]['text_sha256']:
                raise ValueError('Remote/local corpus identity mismatch.')
            result.append({'id':key,'score':row['score'],'rank':row['rank'],'method':method,
                           'transferability':self.by_id[key]['annotation']['transferability']})
        return result


def ingest(client,retriever):
    total=0
    for start in range(0,len(retriever.rows),20):
        rows=[]
        for i in range(start,min(start+20,len(retriever.rows))):
            row=retriever.rows[i]
            annotation=dict(row['annotation'])
            if row.get('transfer_test'):
                annotation.update({'transfer_test':row['transfer_test'],
                    'review_transfer_test':row['review_transfer_test'],
                    'qualification_provenance':row['annotation_provenance']})
            rows.append({**{k:row[k] for k in ['id','text','text_sha256','situation_text','mechanism_text']},'annotation':annotation,
                'embedding_model':'sentence-transformers/all-mpnet-base-v2',
                'embedding_revision':'e8c3b32edf5434bc2275fc9bab85f82640a19130',
                **{name+'_embedding':json.dumps(retriever.vectors[name][i].tolist()) for name in ['full','situation','mechanism']}})
        total+=client.rpc('humor_ingest_examples',p_version=CORPUS_VERSION,p_rows=rows)
    return total

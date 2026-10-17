import copy
import json
import unittest
import tempfile
from pathlib import Path
from humorllm.cli import save_result
from humorllm.pipeline import Pipeline,PipelineConfig
from humorllm.providers import Gemini
from humorllm.store import Ledger,RunStore
from humorllm.supabase import Supabase,RemoteLedger,RemoteRetriever
from test_pipeline import Transport,retriever,SCENE


class WorkerTests(unittest.TestCase):
    def test_resume_on_new_host_reuses_baseline_and_bounds_total_attempts(self):
        checkpoints={}
        def persist(stage,value):checkpoints[stage]=copy.deepcopy(value)
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as first:
            t=Transport(malformed=2)
            a=Pipeline(Gemini('credential',ledger,transport=t),retriever(),first,on_checkpoint=persist)
            self.assertEqual(a.run('r',b'image')['status'],'failed')
            attempts=first.db.execute('select attempts from runs').fetchone()[0]
            self.assertEqual(attempts,3)
            with RunStore(':memory:') as second:
                t2=Transport()
                b=Pipeline(Gemini('credential',ledger,transport=t2),retriever(),second,
                           resume={'checkpoints':checkpoints,'model_attempts':attempts})
                result=b.run('r',b'image')
                self.assertEqual(result['status'],'ready')
                self.assertEqual(len(t2.calls),7)
                self.assertEqual(second.db.execute('select attempts from runs').fetchone()[0],10)
                self.assertEqual(len(result['steps']),10)
            with RunStore(':memory:') as third:
                with self.assertRaises(ValueError):Pipeline(Gemini('credential',ledger,transport=Transport()),retriever(),third,
                    resume={'checkpoints':checkpoints,'model_attempts':3}).run('r',b'changed')

    def test_contradictory_judge_rejects_one_candidate_without_discarding_other_four(self):
        class Contradictory(Transport):
            def __call__(self,body):
                result=super().__call__(body)
                if body['response_format']['schema']['title']=='Selection':
                    value=json.loads(result['steps'][0]['content'][0]['text'])
                    value['judgments'][0]['unsupported_premises']=['Invented context.']
                    result['steps'][0]['content'][0]['text']=json.dumps(value)
                return result
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            t=Contradictory();result=Pipeline(Gemini('credential',ledger,transport=t),retriever(),store).run('r',b'image')
            self.assertEqual(result['status'],'ready');self.assertEqual(len(t.calls),8)
            self.assertNotIn('c1',[c['id'] for c in result['acceptable_candidates']])

    def test_completed_artifact_survives_invalid_rerun_and_missing_selected_evidence_degrades(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            save_result(folder,'run',{'status':'ready','fingerprint':'same'})
            with self.assertRaises(ValueError):save_result(folder,'run',{'status':'failed','error_type':'FileNotFoundError'})
            self.assertEqual(json.loads((folder/'run.json').read_text())['status'],'ready')
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            # Retrieval has hits, but the merge selects only the original association and no demonstrations.
            result=Pipeline(Gemini('credential',ledger,transport=Transport(empty=True)),retriever(),store,PipelineConfig(no_rag_fallback=False)).run('r',b'image')
            self.assertTrue(result['retrieval_ids']);self.assertEqual(result['status'],'degraded')
            self.assertIsNone(result['guided']);self.assertFalse(result['retrieval_evidence_ids'])

    def test_capability_client_restricts_paths_and_remote_cost_unknown_is_not_settled(self):
        calls=[]
        client=Supabase('https://example.supabase.co','anon','w'*48,transport=lambda name,args:calls.append((name,args)) or 'reservation')
        with self.assertRaises(ValueError):client.rpc('arbitrary_sql')
        with self.assertRaises(ValueError):client.download('owner','https://evil.example/')
        ledger=RemoteLedger(client,'run','token');token=ledger.reserve(.1,'scene')
        ledger.settle(token,None);self.assertEqual(len(calls),1)
        ledger.settle(token,.001);self.assertEqual(len(calls),2)
        self.assertEqual(calls[0][1]['p_token'],'token')
        with self.assertRaises(ValueError):Supabase('http://localhost','anon','w'*48)


if __name__=='__main__':unittest.main()

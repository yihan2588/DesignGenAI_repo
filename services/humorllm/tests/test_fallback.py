"""The no-RAG branch must be fresh, source-free, judged, and resumable."""
import json
import unittest
from humorllm.pipeline import Pipeline,PipelineConfig
from humorllm.providers import Gemini,ProviderFailure
from humorllm.store import Ledger,RunStore
from test_pipeline import Transport,retriever


class FallbackTransport(Transport):
    def __init__(self,*,reject_fallback=False,malformed=0):
        super().__init__(empty=True,malformed=malformed)
        self.reject_fallback=reject_fallback

    def __call__(self,body):
        result=super().__call__(body)
        if body['response_format']['schema']['title']=='Selection' and self.reject_fallback:
            value=json.loads(result['steps'][0]['content'][0]['text'])
            for j in value['judgments']:
                j['accepted']=False;j['safety_flags']=['unsafe']
            result['steps'][0]['content'][0]['text']=json.dumps(value)
        return result


class EmptyRankedTransport(FallbackTransport):
    def __init__(self,*,fail_fallback_judge=False,**kwargs):
        super().__init__(**kwargs)
        self.fail_fallback_judge=fail_fallback_judge

    def __call__(self,body):
        if body['response_format']['schema']['title']=='RankedPathChoice':
            self.calls.append(body)
            return {'status':'completed','steps':[{'type':'model_output','content':[{'type':'text','text':json.dumps({
                'ranking':[],'selected_path_ids':['p1'],'reason':'No source found; keep the independent association.'})}]}],
                'usage':{'total_input_tokens':100,'total_output_tokens':100,'total_thought_tokens':10}}
        if self.fail_fallback_judge and 'SOURCE-FREE HOMER-INSPIRED FALLBACK JUDGMENT' in body['input'][0]['text']:
            self.calls.append(body);self.fail_fallback_judge=False
            raise ProviderFailure('configuration',400)
        return super().__call__(body)


class FallbackTests(unittest.TestCase):
    def test_no_qualifying_rag_returns_fresh_judged_fallback_with_no_source_context(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            t=FallbackTransport()
            p=Pipeline(Gemini('credential',ledger,transport=t),retriever(),store)
            result=p.run('r',b'image')
            self.assertEqual(result['status'],'ready')
            self.assertEqual(result['guided_mode'],'no_rag_fallback')
            self.assertTrue(result['guided'])
            self.assertFalse(result['selected_caption_source_ids'])
            self.assertFalse(result['retrieval_evidence_ids'])
            self.assertTrue(result['retrieval_ids'])  # attempts remain truthful
            self.assertEqual(len(t.calls),10)
            self.assertEqual([s['stage'] for s in result['steps']][-2:],['fallback_candidates','fallback_judge'])
            for call in t.calls[-2:]:
                data=json.loads(call['input'][0]['text'].split('QUOTED DATA:\n')[1])
                self.assertNotIn('demonstrations',data)
                self.assertNotIn('source_transfer_plans',data)
                self.assertNotIn('source_critique',data)
                self.assertNotIn('An office worker considers attendance',call['input'][0]['text'])
                self.assertTrue(any(i['type']=='image' for i in call['input']))
            self.assertEqual(p.run('r',b'image'),result)
            self.assertEqual(len(t.calls),10)

    def test_empty_corpus_still_returns_a_pair(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            result=Pipeline(Gemini('credential',ledger,transport=FallbackTransport()),retriever(True),store).run('r',b'image')
            self.assertEqual(result['status'],'ready')
            self.assertEqual(result['guided_mode'],'no_rag_fallback')
            self.assertFalse(result['retrieval_ids'])

    def test_fallback_never_overrides_safety_rejection(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            result=Pipeline(Gemini('credential',ledger,transport=FallbackTransport(reject_fallback=True)),retriever(),store).run('r',b'image')
            self.assertEqual(result['status'],'failed')
            self.assertIsNone(result['guided'])
            self.assertEqual(result['error_category'],'no_safe_caption')
            self.assertTrue(result['fallback']['rejections'])

    def test_fallback_after_schema_repair_keeps_persisted_attempts(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            t=FallbackTransport(malformed=1)
            result=Pipeline(Gemini('credential',ledger,transport=t),retriever(True),store).run('r',b'image')
            self.assertEqual(result['status'],'ready')
            self.assertEqual(len(t.calls),11)
            self.assertEqual(store.db.execute('select attempts from runs').fetchone()[0],11)

    def test_reviewed_mode_with_repair_completes_fallback_in_twelve_attempts(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            t=EmptyRankedTransport(malformed=1)
            result=Pipeline(Gemini('credential',ledger,transport=t),retriever(True),store,
                PipelineConfig(retrieval_method='balanced_rerank')).run('r',b'image')
            self.assertEqual(result['status'],'ready')
            self.assertEqual(result['guided_mode'],'no_rag_fallback')
            self.assertEqual(len(t.calls),12)
            self.assertEqual(store.db.execute('select attempts from runs').fetchone()[0],12)
            with self.assertRaises(ValueError):PipelineConfig(retrieval_method='balanced_rerank',max_attempts=11)

    def test_fallback_resumes_on_another_host_without_repeating_writer(self):
        checkpoints={}
        def persist(stage,value):checkpoints[stage]=value
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as first:
            t=EmptyRankedTransport(fail_fallback_judge=True)
            config=PipelineConfig(retrieval_method='balanced_rerank')
            result=Pipeline(Gemini('credential',ledger,transport=t),retriever(True),first,config,on_checkpoint=persist).run('r',b'image')
            self.assertEqual(result['status'],'failed')
            attempts=first.db.execute('select attempts from runs').fetchone()[0]
            self.assertEqual(attempts,11)
            with RunStore(':memory:') as second:
                t2=EmptyRankedTransport()
                result=Pipeline(Gemini('credential',ledger,transport=t2),retriever(True),second,config,
                    resume={'checkpoints':checkpoints,'model_attempts':attempts}).run('r',b'image')
                self.assertEqual(result['status'],'ready')
                self.assertEqual(result['guided_mode'],'no_rag_fallback')
                self.assertEqual(len(t2.calls),1)
                self.assertEqual(result['steps'][-1]['stage'],'fallback_judge')
                self.assertEqual(second.db.execute('select attempts from runs').fetchone()[0],12)

    def test_normal_rag_success_does_not_call_fallback(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            t=Transport()
            result=Pipeline(Gemini('credential',ledger,transport=t),retriever(),store).run('r',b'image')
            self.assertEqual(result['status'],'ready')
            self.assertEqual(result['guided_mode'],'rag')
            self.assertIsNone(result['fallback'])
            self.assertEqual(len(t.calls),8)


if __name__=='__main__':unittest.main()

import unittest
from humorllm.retrieval import balanced_pool
from humorllm.rerank import RelevanceOrder,validate_order,resolved_evidence,excerpts

class RankingTests(unittest.TestCase):
    def test_pool_preserves_top_five_from_each_channel_and_deduplicates(self):
        channels=[[f'{c}{i}' for i in range(20)] for c in 'abcd']
        pool=balanced_pool(channels,20)
        self.assertEqual(len(pool),20)
        self.assertTrue({f'{c}{i}' for c in 'abcd' for i in range(5)}<=set(pool))
        self.assertEqual(balanced_pool([['a','a','b'],['a','c']],20),['a','b','c'])
        with self.assertRaises(ValueError):balanced_pool(channels,21)

    def test_reranker_rejects_invented_ids_quotes_anchors_and_duplicates(self):
        rows={'j1':{'text':'The office has a sleeping supervisor.'}}
        value={'ranking':[{'source_id':'j1','grade':2,'source_excerpt_id':'e01',
                           'visual_anchor_id':'v01','relation':'Sleep at a workstation is treated as supervision.'}]}
        order=RelevanceOrder.model_validate(value)
        validate_order(order,rows,'A cat sleeps on a keyboard.',expected=1)
        for field,bad in [('source_id','missing'),('source_excerpt_id','made_up'),('visual_anchor_id','coworker')]:
            changed={**value['ranking'][0],field:bad}
            with self.assertRaises(ValueError):validate_order(RelevanceOrder.model_validate({'ranking':[changed]}),rows,'A cat sleeps on a keyboard.',expected=1)
        with self.assertRaises(ValueError):validate_order(RelevanceOrder.model_validate({'ranking':value['ranking']*2}),rows,'A cat sleeps on a keyboard.',expected=2)
        proof=resolved_evidence(order,rows,'A cat sleeps on a keyboard.')[0]
        self.assertIn(proof['source_quote'],rows['j1']['text'])
        self.assertEqual(proof['visual_anchor'],'A cat sleeps on a keyboard.')
        for span in excerpts('An exact quote with punctuation!  Preserve spaces and a long enough sequence of words after it.'):
            self.assertIn(span['text'],'An exact quote with punctuation!  Preserve spaces and a long enough sequence of words after it.')


class PipelineRankingTests(unittest.TestCase):
    def test_reviewed_mode_uses_nine_calls_within_ten_attempt_cap_and_rejects_weak_evidence(self):
        import json
        from humorllm.pipeline import Pipeline,PipelineConfig
        from humorllm.providers import Gemini
        from humorllm.store import Ledger,RunStore
        from test_pipeline import Transport,retriever
        class RankedTransport(Transport):
            def __init__(self,grade,supported=True,invalid_proposal=False):
                super().__init__();self.grade=grade;self.supported=supported
                self.invalid_proposal=invalid_proposal;self.ranking_calls=0
            def __call__(self,body):
                if body['response_format']['schema']['title']!='RankedPathChoice':
                    response=super().__call__(body)
                    if body['response_format']['schema']['title']=='Selection' and not self.supported:
                        content=response['steps'][0]['content'][0];value=json.loads(content['text'])
                        for j in value['judgments']:
                            for s in j['source_checks']:s['supported']=False
                        content['text']=json.dumps(value)
                    elif body['response_format']['schema']['title']=='Selection':
                        content=response['steps'][0]['content'][0];value=json.loads(content['text'])
                        for j in value['judgments']:
                            for s in j['source_checks']:
                                s.update(setup_span='Attendance confirmed.',turn_span='Productivity has entered sleep mode.')
                        content['text']=json.dumps(value)
                    return response
                self.calls.append(body)
                self.ranking_calls+=1
                value={'selected_path_ids':['p1'],'reason':'Use an attendance analogy.',
                       'ranking':[{'source_id':'j1','grade':self.grade,'source_excerpt_id':'e01',
                                   'visual_anchor_id':'v01','relation':'Presence at a work surface without contributing.',
                                   'transfer_plan':{'kind':'relational','source_relation':'Attendance replaces work.',
                                       'target_relation':'Lying on the keyboard replaces doing work.','detail_ids':['d1'],
                                       'lexical_bridge':[], 'realization':{
                                           'source_setup':'An office worker', 'source_turn':'attendance a substitute for contributing.',
                                           'caption_seed':'Attendance confirmed. Productivity has entered sleep mode.',
                                           'target_setup_span':'Attendance confirmed.',
                                           'target_turn_span':'Productivity has entered sleep mode.',
                                           'framing':'A cat on a work surface personifies an idle worker.'}} if self.grade==2 or self.ranking_calls==1 else None}]}
                if self.invalid_proposal and self.ranking_calls==1:
                    value['ranking'][0]['transfer_plan']['kind']='wordplay'  # missing required lexical bridge
                return {'status':'completed','steps':[{'type':'model_output','content':[{'type':'text','text':json.dumps(value)}]}],
                        'usage':{'total_input_tokens':100,'total_output_tokens':100,'total_thought_tokens':10}}
        for grade,supported,invalid in [(2,True,False),(1,False,False),(2,False,False),(2,True,True),(1,True,False)]:
            with self.subTest(grade=grade,supported=supported),Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
                t=RankedTransport(grade,supported,invalid)
                result=Pipeline(Gemini('credential',ledger,transport=t),retriever(),store,
                                PipelineConfig(retrieval_method='balanced_rerank',max_attempts=9,no_rag_fallback=False)).run('r',b'image')
                # A planner's grade-1 critique is advisory. Actual caption transfer is decided later.
                self.assertEqual(result['status'],'ready' if supported else 'degraded')
                self.assertEqual(len(t.calls),9)
                if grade==1 and supported:
                    self.assertEqual(result['source_transfer_plans']['j1']['review_status'],'unreviewed_hypothesis')
                    self.assertEqual(result['selected_caption_source_ids'],['j1'])
                self.assertIsNotNone(store.load('r','source_review'))
                if invalid:
                    self.assertEqual(result['proposed_reranking']['ranking'][0]['transfer_plan']['kind'],'wordplay')
                    self.assertEqual(result['reranking']['ranking'][0]['transfer_plan']['kind'],'relational')
                    self.assertIsNone(store.load('r','schema_repair_used'))
                self.assertTrue(result['reranking'])
                self.assertLessEqual(len(result['retrieval_ids']),20)
                if not supported:
                    self.assertFalse(result['retrieval_evidence_ids'])
                    self.assertIsNone(result['guided'])
                    self.assertTrue(result['association_only'])
                if grade==2 and not supported:self.assertEqual(result['admitted_source_ids'],['j1'])

    def test_remote_pool_cannot_reintroduce_sources_filtered_by_database(self):
        from humorllm.supabase import RemoteRetriever,Supabase
        from test_pipeline import retriever
        local=retriever()
        client=Supabase('https://example.supabase.co','anon','x'*48,transport=lambda *_:[])
        self.assertEqual(RemoteRetriever(local,client,production=True).candidate_pool('cat',mechanism='work',entity='cat'),[])

if __name__=='__main__':unittest.main()

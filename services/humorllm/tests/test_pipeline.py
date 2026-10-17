import copy
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np

from humorllm.embeddings import DIMENSION
from humorllm.pipeline import Pipeline,PipelineConfig
from humorllm.providers import Gemini,ProviderFailure
from humorllm.rank import copy_score
from humorllm.retrieval import Retriever,CORPUS_VERSION
from humorllm.store import Ledger,RunStore

SCENE={'title':'Sleeping cat','description':'A cat sleeps on a laptop keyboard.',
       'details':[{'id':'d1','observation':'A cat lies on a keyboard.','confidence':.95},
                  {'id':'d2','observation':'The cat has closed eyes.','confidence':.9}],'image_text':[]}
CONFLICTS={'conflicts':[{'id':'s1','expectation':'Workstations are used for productive work.',
                         'interpretation':'Being present is treated as the whole job.','detail_ids':['d1'],'kind':'analogy'}]}
ASSOCIATIONS={'paths':[{'id':'a1','root_detail_id':'d1','conflict_id':'s1','root_entity':'cat',
                       'nodes':[{'entity':'employee','relation':'A proposed work analogy.'},
                                {'entity':'attendance','relation':'An employee attends work.'},
                                {'entity':'contribution','relation':'Attendance normally involves contribution.'}]}]}
CAPTIONS=['Attendance confirmed. Productivity has entered sleep mode.',
          'I negotiated a position with horizontal advancement.',
          'The keyboard needed a supervisor with softer management skills.',
          'Please direct all urgent requests to my next nap.',
          'My performance review contains an unusually detailed sleep schedule.']


class FakeEncoder:
    def encode(self,texts,batch_size=8):
        values=np.zeros((len(texts),DIMENSION),dtype=np.float32);values[:,0]=1;return values


def retriever(empty=False):
    row={'id':'j1','text':'An office worker considers attendance a substitute for contributing.',
         'setup':'An office worker attends work.','situation_text':'Being present without working.',
         'mechanism_text':'irony of attendance without contribution','allowed_use':True,'split':'train',
         'language':'en','corpus_version':CORPUS_VERSION,'production_eligible':False,
         'annotation':{'entities':['worker','office'],'situation':'An office worker does no work.',
                       'mechanism':'irony','twist':'Attendance replaces contribution.','transferability':'situational'}}
    rows=[] if empty else [row];encoder=FakeEncoder()
    return Retriever(rows,{f:encoder.encode([r['text'] for r in rows]) for f in ['full','situation','mechanism']},encoder)


class Transport:
    def __init__(self,*,malformed=0,empty=False,outage=False):
        self.calls=[];self.malformed=malformed;self.empty=empty;self.outage=outage

    def __call__(self,body):
        self.calls.append(body)
        if self.outage:raise ProviderFailure('unavailable',503)
        title=body['response_format']['schema']['title']
        if title=='Caption':value={'caption':'My office permits a very flexible sleeping arrangement.'}
        elif title=='Scene':
            value=copy.deepcopy(SCENE)
            if self.malformed:self.malformed-=1;value['details']=[]
        elif title=='GroundedConflictSet':value={**CONFLICTS,'verified_scene':SCENE,'rejected_visual_claims':[]}
        elif title=='AssociationSet':value=ASSOCIATIONS
        elif title=='PathChoice':value={'selected_path_ids':['p1'],'selected_source_ids':[] if self.empty else ['j1'],'reason':'Adapt the work/attendance relation.'}
        elif title=='CandidateSet':
            value={'candidates':[{'id':'c'+str(i),'caption':text,'mechanism':'irony','detail_ids':['d1'],
                                 'path_ids':['p1'],'retrieval_ids':[] if self.empty else ['j1'],
                                 'source_applications':[] if self.empty else [{'source_id':'j1','caption_span':text,
                                     'adaptation':'Attendance replaces contribution at a work surface.'}]} for i,text in enumerate(CAPTIONS,1)]}
        elif title=='Selection':
            value={'judgments':[{'candidate_id':'c'+str(i),'accepted':True,'detail_ids':['d1'],
                                 'unsupported_premises':[],'safety_flags':[],'literal_claims':[],'rank':i,'reason':'The work analogy is clearly figurative.',
                                 'source_checks':[] if self.empty else [{'source_id':'j1','supported':True,
                                     'reason':'The source reverses productive work into mere attendance.'}]} for i in range(1,6)]}
        else:raise AssertionError(title)
        return {'status':'completed','steps':[{'type':'model_output','content':[{'type':'text','text':json.dumps(value)}]}],
                'usage':{'total_input_tokens':100,'total_output_tokens':100,'total_thought_tokens':10}}


class PipelineTests(unittest.TestCase):
    def test_eight_call_path_preserves_baseline_independence_and_is_idempotent(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            transport=Transport();pipeline=Pipeline(Gemini('credential',ledger,transport=transport),retriever(),store)
            result=pipeline.run('r',b'image')
            self.assertEqual(result['status'],'ready');self.assertEqual(len(transport.calls),8)
            baseline_prompt=transport.calls[0]['input'][0]['text']
            self.assertNotIn('j1',baseline_prompt);self.assertNotIn('Being present',baseline_prompt)
            self.assertNotIn('thinking_level',transport.calls[0]['generation_config'])
            self.assertEqual(transport.calls[-1]['generation_config']['thinking_level'],'medium')
            self.assertEqual(transport.calls[-1]['generation_config']['max_output_tokens'],8192)
            self.assertEqual(transport.calls[0]['generation_config']['max_output_tokens'],4096)
            self.assertEqual(transport.calls[0]['model'],transport.calls[-1]['model'])
            self.assertEqual(transport.calls[1]['model'],'gemini-3.1-flash-lite')
            self.assertTrue(result['retrieval_evidence_ids']);self.assertLessEqual(result['demonstration_bytes'],1500)
            graph=store.load('r','retrieval_graph')
            self.assertLessEqual(len(graph['queries']),8);self.assertLessEqual(len(graph['source_ids']),20)
            self.assertTrue(all(len(p['nodes'])<=3 for p in graph['paths']))
            self.assertEqual(pipeline.run('r',b'image'),result);self.assertEqual(len(transport.calls),8)
            with self.assertRaises(ValueError):pipeline.run('r',b'different-image')

    def test_single_schema_repair_and_persistent_attempts(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            transport=Transport(malformed=1);pipeline=Pipeline(Gemini('credential',ledger,transport=transport),retriever(),store)
            result=pipeline.run('r',b'image')
            self.assertEqual(result['status'],'ready');self.assertEqual(len(transport.calls),9)
            self.assertEqual(store.load('r','schema_repair_used')['stage'],'scene')

    def test_visual_audit_replaces_draft_before_associations_retrieval_and_judging(self):
        class FallibleDraft(Transport):
            def __call__(self,body):
                response=super().__call__(body)
                content=response['steps'][0]['content'][0]
                if body['response_format']['schema']['title']=='Scene':
                    value=json.loads(content['text']);value['description']='UNSUPPORTED_SENSOR_MAINTENANCE'
                    content['text']=json.dumps(value)
                elif body['response_format']['schema']['title']=='GroundedConflictSet':
                    value=json.loads(content['text']);value['rejected_visual_claims']=['UNSUPPORTED_SENSOR_MAINTENANCE']
                    content['text']=json.dumps(value)
                return response
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            transport=FallibleDraft()
            result=Pipeline(Gemini('credential',ledger,transport=transport),retriever(),store).run('r',b'image')
            self.assertEqual(result['status'],'ready')
            self.assertEqual(result['verified_scene']['description'],SCENE['description'])
            self.assertIn('UNSUPPORTED_SENSOR_MAINTENANCE',result['rejected_visual_claims'])
            for call in transport.calls[3:]:
                self.assertNotIn('UNSUPPORTED_SENSOR_MAINTENANCE',call['input'][0]['text'])

    def test_failed_scene_can_resume_without_repeating_baseline_or_resetting_attempts(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            transport=Transport(malformed=2);pipeline=Pipeline(Gemini('credential',ledger,transport=transport),retriever(),store)
            self.assertEqual(pipeline.run('r',b'image')['status'],'failed')
            baseline=store.load('r','baseline');self.assertIsNotNone(baseline)
            self.assertEqual(pipeline.run('r',b'image')['status'],'ready')
            self.assertEqual(len(transport.calls),10)
            self.assertEqual(sum(c['response_format']['schema']['title']=='Caption' for c in transport.calls),1)

    def test_empty_retrieval_is_truthful_degradation_not_fake_rag_success(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            transport=Transport(empty=True)
            result=Pipeline(Gemini('credential',ledger,transport=transport),retriever(True),store,PipelineConfig(no_rag_fallback=False)).run('r',b'image')
            self.assertEqual(result['status'],'degraded');self.assertIsNone(result['guided'])
            self.assertEqual(result['retrieval_ids'],[])

    def test_network_failure_keeps_unknown_usage_reserved_and_stops_boundedly(self):
        with Ledger(':memory:',1) as ledger,RunStore(':memory:') as store:
            transport=Transport(outage=True)
            result=Pipeline(Gemini('credential',ledger,transport=transport),retriever(),store).run('r',b'image')
            self.assertEqual(result['status'],'failed');self.assertEqual(len(transport.calls),2)
            self.assertAlmostEqual(ledger.total(),.2)
            self.assertNotIn('credential',json.dumps(result))

    def test_copy_check_handles_inserted_punctuation_and_ocr(self):
        self.assertGreaterEqual(copy_score('Perfect attendance; questionable contribution!', 'Perfect attendance. Questionable contribution.'),.8)
        self.assertGreaterEqual(copy_score('Please do not feed the office supervisor.', 'Please do not feed the office supervisor'),.8)
        self.assertLess(copy_score('A quiet day at the beach.','I work in a quiet office with no windows.'),.8)

    def test_ledger_reservations_are_atomic_across_threads(self):
        with Ledger(':memory:',1) as ledger:
            def reserve(_):
                try:ledger.reserve(.2,'test');return True
                except ValueError:return False
            with ThreadPoolExecutor(max_workers=5) as pool:results=list(pool.map(reserve,range(20)))
            self.assertEqual(sum(results),5);self.assertAlmostEqual(ledger.total(),1)

    def test_stale_worker_cannot_checkpoint_or_finish_after_lease_reclaim(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'runs.sqlite'
            with RunStore(path) as a,RunStore(path) as b:
                a.begin('r','same')
                with self.assertRaises(ValueError):b.begin('r','same')
                a.db.execute('update runs set lease_until=0 where id=?',('r',))
                b.begin('r','same')
                with self.assertRaises(ValueError):a.save('r','scene',SCENE)
                with self.assertRaises(ValueError):a.finish('r','ready',{})
                b.save('r','scene',SCENE);self.assertEqual(b.load('r','scene'),SCENE)


if __name__=='__main__':unittest.main()

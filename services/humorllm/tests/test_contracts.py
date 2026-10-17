"""Behavior contracts: no provider requests or model downloads in these tests."""
import unittest
from humorllm.schemas import Scene, ConflictSet, AssociationSet, CandidateSet, Selection, validate_links
from humorllm.retrieval import reciprocal_rank_fusion, eligible_examples
from humorllm.store import Ledger, RunStore

class Contracts(unittest.TestCase):
    def test_reference_ids_are_not_invented(self):
        scene=Scene.model_validate({'title':'Sleeping cat','description':'A cat sleeps on a keyboard.','details':[{'id':'d1','observation':'A cat sleeps on a keyboard.','confidence':.9}],'image_text':[]})
        conflicts=ConflictSet.model_validate({'conflicts':[{'id':'s1','expectation':'A keyboard is used for work.','interpretation':'Presence without work.','detail_ids':['missing'],'kind':'analogy'}]})
        with self.assertRaises(ValueError): validate_links(scene,conflicts)
    def test_rank_fusion_and_missing_channels(self):
        ranks=reciprocal_rank_fusion([['cat','office'],['office','avoid']])
        self.assertEqual(ranks[0][0],'office')
        self.assertAlmostEqual(ranks[0][1],1/52+1/51)
    def test_held_out_and_disallowed_records_are_filtered_before_search(self):
        rows=[{'id':'ok','allowed_use':True,'split':'train','language':'en','corpus_version':'v1'},{'id':'held','allowed_use':True,'split':'test','language':'en','corpus_version':'v1'},{'id':'no','allowed_use':False,'split':'train','language':'en','corpus_version':'v1'}]
        self.assertEqual([r['id'] for r in eligible_examples(rows,'v1')],['ok'])
    def test_budget_is_reserved_atomically_and_unknown_cost_stays_reserved(self):
        with Ledger(':memory:',1.0) as ledger:
            first=ledger.reserve(.7,'scene')
            with self.assertRaises(ValueError): ledger.reserve(.4,'next')
            ledger.settle(first,None)
            self.assertAlmostEqual(ledger.total(),.7)
    def test_first_checkpoint_survives_later_failed_attempt(self):
        with RunStore(':memory:') as store:
            store.begin('run','fingerprint')
            store.save('run','scene',{'title':'Saved'})
            store.finish('run','failed',{'error':'interrupted'})
            store.begin('run','fingerprint')
            self.assertEqual(store.load('run','scene'),{'title':'Saved'})
            with self.assertRaises(ValueError): store.begin('run','different-fingerprint')

if __name__=='__main__': unittest.main()

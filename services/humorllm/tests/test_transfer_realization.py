"""Regressions for the source-to-caption handoff, not humor preference scores."""
import unittest
from humorllm.rerank import RelevanceOrder,validate_transfer_plans
from humorllm.rank import accepted_candidates,grounded_phrase
from humorllm.schemas import Scene
from test_grounding import records


class RealizationTests(unittest.TestCase):
    def test_advisory_hypotheses_cannot_bypass_wordplay_provenance(self):
        from humorllm.rerank import RankedPathChoice,generation_plans
        scene=Scene.model_validate({'title':'Cat','description':'A cat sits.',
            'details':[{'id':'d1','observation':'A cat sits.','confidence':1}],'image_text':[]})
        raw={'source_id':'j1','grade':1,'source_excerpt_id':'e01','visual_anchor_id':'v01',
            'relation':'An unreviewed idea.','transfer_plan':{'kind':'relational',
            'source_relation':'A pun has two senses.','target_relation':'A cat sits.',
            'detail_ids':['d1'],'lexical_bridge':[],'realization':{
                'source_setup':'A pun.','source_turn':'Two senses.',
                'caption_seed':'My supervisor has clocked in and immediately clocked out.',
                'target_setup_span':'My supervisor has clocked in','target_turn_span':'immediately clocked out.',
                'framing':'Fictional work role.'}}}
        proposed=RankedPathChoice(ranking=[raw],selected_path_ids=['p1'],reason='Prototype.')
        reviewed=RankedPathChoice(ranking=[],selected_path_ids=['p1'],reason='No admission yet.')
        plans,rejected=generation_plans(proposed,reviewed,{'j1':{'text':'A pun. Two senses.',
            'annotation':{'transferability':'wordplay_only'}}},scene)
        self.assertFalse(plans)
        self.assertIn('wordplay-only',rejected[0]['reason'])

    def test_graph_searches_each_relation_instead_of_repeating_the_same_scene(self):
        import copy
        from humorllm.imagine import build_graph
        from humorllm.schemas import AssociationSet,ConflictSet
        from test_pipeline import SCENE,CONFLICTS,ASSOCIATIONS,retriever
        scene=Scene.model_validate(SCENE);conflicts=ConflictSet.model_validate(CONFLICTS)
        raw=copy.deepcopy(ASSOCIATIONS)
        probe='Someone claims professional status through mere presence instead of useful work.'
        raw['paths'][0]['nodes'][0]['retrieval_query']=probe
        associations=AssociationSet.model_validate(raw)
        graph=build_graph(scene,conflicts,associations,associations,retriever(),'balanced')
        q=next(q for q in graph['queries'] if q['depth']==1)
        self.assertEqual(q['mechanism'],probe)
        self.assertIn(scene.details[0].observation,q['text'])
        self.assertNotIn(scene.description,q['text'])
        self.assertLessEqual(len(graph['queries']),8)
        self.assertLessEqual(len(graph['source_ids']),20)

    def test_registered_models_use_their_own_rates_and_unknown_models_fail_closed(self):
        from humorllm.providers import Gemini
        from humorllm.schemas import Caption
        from humorllm.store import Ledger
        from test_pipeline import Transport
        for model,expected in [('gemini-3.1-flash-lite',.00019),('gemini-3.8-flash',.0004875)]:
            with self.subTest(model=model),Ledger(':memory:',1) as ledger:
                _,step=Gemini('credential',ledger,model=model,transport=Transport()).call('baseline','Caption.',Caption)
                self.assertEqual(step['model'],model)
                self.assertAlmostEqual(ledger.total(),expected)
                self.assertAlmostEqual(step['estimated_cost_usd'],expected)
        with Ledger(':memory:',1) as ledger:
            with self.assertRaisesRegex(ValueError,'Unpriced model'):Gemini('credential',ledger,model='unregistered')
            self.assertEqual(ledger.total(),0)

    def test_vague_admission_is_not_a_caption_realization(self):
        scene=Scene.model_validate({'title':'Rider','description':'A bear rides a dog.',
            'details':[{'id':'d1','observation':'A bear rides a dog.','confidence':1}], 'image_text':[]})
        order=RelevanceOrder.model_validate({'ranking':[{'source_id':'j1','grade':2,
            'source_excerpt_id':'e01','visual_anchor_id':'v01','relation':'Animals travel.',
            'transfer_plan':{'kind':'relational','source_relation':'An animal predicts danger by escaping.',
                'target_relation':'A bear gets a ride.','detail_ids':['d1'],'lexical_bridge':[]}}]})
        with self.assertRaisesRegex(ValueError,'realization'):
            validate_transfer_plans(order,{'j1':{'text':'Dogs predict quakes. Mine drove away.'}},scene,require_realization=True)

    def test_supported_boolean_without_both_caption_components_cannot_pass(self):
        candidates,selection=records()
        plans={'j1':{'kind':'relational','realization':{'caption_seed':candidates.candidates[0].caption}}}
        accepted,rejected=accepted_candidates(candidates,selection,[],[],'baseline',require_transfer=True,source_plans=plans)
        self.assertFalse(accepted)
        self.assertTrue(all('no_verified_source_transfer' in r['reasons'] for r in rejected))
        selection.judgments[0].source_checks[0].setup_span='Attendance confirmed.'
        selection.judgments[0].source_checks[0].turn_span='Productivity has entered sleep mode.'
        accepted,_=accepted_candidates(candidates,selection,[],[],'baseline',require_transfer=True,source_plans=plans)
        self.assertEqual([c['id'] for c in accepted],['c1'])
        selection.judgments[0].source_checks[0].turn_span='The animal escaped danger.'
        accepted,_=accepted_candidates(candidates,selection,[],[],'baseline',require_transfer=True,source_plans=plans)
        self.assertFalse(accepted)

    def test_paraphrase_support_does_not_upgrade_an_ambiguous_object(self):
        self.assertTrue(grounded_phrase('A person stands on a grey sofa.','standing on the couch'))
        self.assertTrue(grounded_phrase('A plush bear sits on a plush dog.','stuffed bear'))
        self.assertTrue(grounded_phrase('A person stands on the cushions of a grey sofa.','sofa cushions'))
        self.assertTrue(grounded_phrase('A person stands on the cushions of a grey sofa.','standing on couch cushions'))
        self.assertTrue(grounded_phrase('A person stands on the cushions of a grey sofa.','balancing on couch cushions'))
        self.assertFalse(grounded_phrase('A person stands on the cushions of a grey sofa.','balancing a lamp'))
        self.assertFalse(grounded_phrase('A bear rides a dog.','dog rides bear'))
        self.assertFalse(grounded_phrase('A bear sits on a dog.','dog sits on bear'))
        self.assertFalse(grounded_phrase('A person reaches toward a round object.','smoke detector'))
        self.assertFalse(grounded_phrase('A person stands on a grey sofa.','falling off the couch'))

    def test_source_application_must_cover_setup_and_turn_not_only_a_punchline(self):
        candidates,selection=records()
        candidates.candidates[0].source_applications[0].caption_span='Productivity has entered sleep mode.'
        accepted,rejected=accepted_candidates(candidates,selection,[],[],'baseline',require_transfer=True,
            source_plans={'j1':{'kind':'relational'}})
        self.assertNotIn('c1',[c['id'] for c in accepted])
        self.assertIn('invalid_source_application',next(r for r in rejected if r['id']=='c1')['reasons'])

    def test_source_component_quotes_cannot_be_invented_to_rescue_a_plan(self):
        from humorllm.rerank import TransferPlan
        scene=Scene.model_validate({'title':'Rider','description':'A bear rides a dog.',
            'details':[{'id':'d1','observation':'A bear rides a dog.','confidence':1}], 'image_text':[]})
        order=RelevanceOrder.model_validate({'ranking':[{'source_id':'j1','grade':2,
            'source_excerpt_id':'e01','visual_anchor_id':'v01','relation':'A warning becomes an escape.'}]})
        order.ranking[0].transfer_plan=TransferPlan.model_validate({'kind':'relational',
            'source_relation':'An animal predicts danger by escaping.','target_relation':'A bear escapes.',
            'detail_ids':['d1'],'lexical_bridge':[],'realization':{
                'source_setup':'Dogs predict quakes.','source_turn':'Mine drove away.',
                'caption_seed':'When the bear predicts trouble, his dog becomes an escape vehicle.',
                'target_setup_span':'the bear predicts trouble','target_turn_span':'an escape vehicle',
                'framing':'Hypothetical animal travel.'}})
        rows={'j1':{'text':'Dogs predict quakes. Mine drove away.'}}
        validate_transfer_plans(order,rows,scene,require_realization=True)
        order.ranking[0].transfer_plan.realization.source_turn='Mine gave the bear a ride.'
        with self.assertRaisesRegex(ValueError,'quote the original'):
            validate_transfer_plans(order,rows,scene,require_realization=True)


if __name__=='__main__':unittest.main()

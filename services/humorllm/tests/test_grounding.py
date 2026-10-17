"""Grounding and transfer regressions derived from the two-photo development audit."""
import copy
import unittest
from humorllm.schemas import CandidateSet, Selection
from humorllm.rank import accepted_candidates
from test_pipeline import CAPTIONS


def records():
    candidates=CandidateSet.model_validate({'candidates':[
        {'id':f'c{i}','caption':caption,'mechanism':'presence replaces contribution',
         'detail_ids':['d1'],'path_ids':['p1'],'retrieval_ids':['j1'],
         'source_applications':[{'source_id':'j1','caption_span':caption,
                                 'adaptation':'Physical attendance is substituted for productive work.'}]}
        for i,caption in enumerate(CAPTIONS,1)]})
    selection=Selection.model_validate({'judgments':[
        {'candidate_id':f'c{i}','accepted':True,'detail_ids':['d1'],'unsupported_premises':[],
         'safety_flags':[],'literal_claims':[],'rank':i,'reason':'Workplace analogy.',
         'source_checks':[{'source_id':'j1','supported':True,'reason':'The presence/contribution reversal survives.'}]}
        for i in range(1,6)]})
    return candidates,selection


class GroundingRegressions(unittest.TestCase):
    def test_wire_schema_simplification_preserves_structure_and_local_constraints(self):
        from humorllm.providers import provider_schema
        from pydantic import ValidationError
        schema=provider_schema(Selection)
        self.assertEqual(schema['properties']['judgments']['items'],{'$ref':'#/$defs/Judgment'})
        self.assertNotIn('maxItems',schema['properties']['judgments'])
        self.assertIn('exactly 5 items',schema['properties']['judgments']['description'])
        self.assertIn('at most 180 characters',schema['$defs']['Judgment']['properties']['reason']['description'])
        self.assertIn('literal_claims',schema['$defs']['Judgment']['required'])
        self.assertFalse(schema['$defs']['LiteralClaim']['additionalProperties'])
        candidates,selection=records();bad=selection.model_dump();bad['judgments']*=2
        with self.assertRaises(ValidationError):Selection.model_validate(bad)
        bad=candidates.model_dump();bad['candidates'][0]['id']='an invalid identifier'
        with self.assertRaises(ValidationError):CandidateSet.model_validate(bad)

    def test_unclaimed_or_unverified_sources_cannot_pass_as_retrieval_backed(self):
        candidates,selection=records()
        for kind in ['unclaimed','no_judge_check','judge_rejects']:
            with self.subTest(kind=kind):
                c,s=copy.deepcopy(candidates),copy.deepcopy(selection)
                for row in c.candidates:
                    if kind=='unclaimed':row.retrieval_ids=[];row.source_applications=[]
                for row in s.judgments:
                    if kind=='no_judge_check':row.source_checks=[]
                    if kind=='judge_rejects':row.source_checks[0].supported=False
                accepted,rejected=accepted_candidates(c,s,[],[],'baseline',require_transfer=True,source_plans={'j1':{}})
                self.assertEqual(accepted,[])
                self.assertTrue(all('no_verified_source_transfer' in row['reasons'] for row in rejected))

    def test_exact_caption_span_and_wordplay_bridge_are_enforced(self):
        candidates,selection=records()
        accepted,_=accepted_candidates(candidates,selection,[],[],'baseline',require_transfer=True,source_plans={'j1':{'kind':'relational','lexical_bridge':[]}})
        self.assertTrue(accepted)
        self.assertEqual(accepted[0]['verified_source_ids'],['j1'])
        candidates.candidates[0].source_applications[0].caption_span='Invented quotation absent from caption'
        accepted,rejected=accepted_candidates(candidates,selection,[],[],'baseline',require_transfer=True,source_plans={'j1':{'kind':'relational','lexical_bridge':[]}})
        self.assertNotIn('c1',[c['id'] for c in accepted])
        self.assertIn('invalid_source_application',next(r for r in rejected if r['id']=='c1')['reasons'])
        accepted,_=accepted_candidates(*records(),[],[],'baseline',require_transfer=True,source_plans={'j1':{'kind':'wordplay','lexical_bridge':['Santa pause']}})
        self.assertFalse(accepted)

    def test_a_supported_check_for_another_source_cannot_launder_a_claim(self):
        candidates,selection=records()
        for row in selection.judgments:row.source_checks[0].source_id='j2'
        accepted,_=accepted_candidates(candidates,selection,[],[],'baseline',require_transfer=True,source_plans={'j1':{},'j2':{}})
        self.assertFalse(accepted)

    def test_literal_specificity_cannot_exceed_the_observed_evidence_even_if_judge_accepts(self):
        from humorllm.schemas import Scene,LiteralClaim
        candidates,selection=records()
        scene=Scene.model_validate({'title':'Reaching','description':'A person reaches toward a round object.',
            'details':[{'id':'d1','observation':'A person reaches toward a round object.','confidence':.9}],
            'image_text':[],'uncertainties':['The object identity is unknown.']})
        candidates.candidates[0].caption='Reaching toward the smoke detector.'
        candidates.candidates[0].retrieval_ids=[];candidates.candidates[0].source_applications=[]
        selection.judgments[0].source_checks=[]
        selection.judgments[0].literal_claims=[LiteralClaim(caption_span='smoke detector',detail_id='d1',kind='literal')]
        accepted,rejected=accepted_candidates(candidates,selection,[],[],'baseline',scene=scene)
        self.assertNotIn('c1',[c['id'] for c in accepted])
        self.assertIn('unverified_literal_claim',next(r for r in rejected if r['id']=='c1')['reasons'])
        candidates.candidates[0].caption='Reaching toward a round object.'
        selection.judgments[0].literal_claims=[LiteralClaim(caption_span='round object',detail_id='d1',kind='literal')]
        accepted,_=accepted_candidates(candidates,selection,[],[],'baseline',scene=scene)
        self.assertIn('c1',[c['id'] for c in accepted])

    def test_figurative_phrases_use_visual_premises_without_becoming_literal_identities(self):
        from humorllm.schemas import Scene,LiteralClaim
        candidates,selection=records()
        scene=Scene.model_validate({'title':'Toy rider','description':'One toy sits on another.',
            'details':[{'id':'d1','observation':'A plush bear sits on a plush dog.','confidence':1}],
            'image_text':[]})
        candidates.candidates[0].caption='My chauffeur has excellent paw-powered suspension.'
        candidates.candidates[0].retrieval_ids=[];candidates.candidates[0].source_applications=[]
        selection.judgments[0].source_checks=[]
        claim=LiteralClaim(caption_span='chauffeur',detail_id='d1',kind='analogy')
        selection.judgments[0].literal_claims=[claim]
        accepted,_=accepted_candidates(candidates,selection,[],[],'baseline',scene=scene)
        self.assertIn('c1',[c['id'] for c in accepted])
        claim.kind='literal'
        accepted,_=accepted_candidates(candidates,selection,[],[],'baseline',scene=scene)
        self.assertNotIn('c1',[c['id'] for c in accepted])

    def test_wordplay_classification_cannot_be_bypassed_by_a_relational_label(self):
        from humorllm.schemas import Scene
        from humorllm.rerank import RelevanceOrder,validate_transfer_plans
        scene=Scene.model_validate({'title':'Cat','description':'A cat sits.',
            'details':[{'id':'d1','observation':'A cat sits.','confidence':.9}],'image_text':[]})
        order=RelevanceOrder.model_validate({'ranking':[{'source_id':'j1','grade':2,'source_excerpt_id':'e01',
            'visual_anchor_id':'v01','relation':'A claimed relation.','transfer_plan':{'kind':'relational',
            'source_relation':'A pun requires a word.','target_relation':'A cat sits.','detail_ids':['d1'],'lexical_bridge':[]}}]})
        with self.assertRaisesRegex(ValueError,'wordplay-only'):
            validate_transfer_plans(order,{'j1':{'text':'A pun.','annotation':{'transferability':'wordplay_only'}}},scene)


if __name__=='__main__':unittest.main()

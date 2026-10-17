"""Restartable HOMER-inspired product pipeline. No successful result is fabricated."""
from __future__ import annotations

from dataclasses import asdict,dataclass
import hashlib
import json
import time
from pathlib import Path
from pydantic import ValidationError
from . import prompts
from .schemas import Scene,ConflictSet,GroundedConflictSet,AssociationSet,PathChoice,CandidateSet,Selection,Caption,validate_links,subset
from .imagine import build_graph,demonstrations
from .rank import accepted_candidates,copy_score
from .providers import ProviderFailure
from .rerank import RankedPathChoice,validate_order,validate_transfer_plans,generation_plans,source_packet,INSTRUCTION as RERANK_INSTRUCTION,PATH_INSTRUCTION,PROPOSE_INSTRUCTION,REVIEW_INSTRUCTION,scene_anchors,resolved_evidence
from .embeddings import MODEL as ENCODER_MODEL,REVISION as ENCODER_REVISION


@dataclass(frozen=True)
class PipelineConfig:
    retrieval_method: str = 'full_dense'
    max_attempts: int = 12
    deadline_seconds: int = 300
    mode: str = 'humorllm'
    no_rag_fallback: bool = True

    def __post_init__(self):
        if self.retrieval_method not in {'full_dense','hybrid','release_lexical','balanced_rerank'}:raise ValueError('Invalid retrieval method.')
        if self.mode!='humorllm' or not 8<=self.max_attempts<=12 or not 30<=self.deadline_seconds<=600:
            raise ValueError('Invalid pipeline bounds/mode.')
        if self.retrieval_method=='balanced_rerank' and self.max_attempts<9:
            raise ValueError('Reviewed source realization needs nine normal calls.')
        normal=9 if self.retrieval_method=='balanced_rerank' else 8
        if self.no_rag_fallback and self.max_attempts<normal+3:
            raise ValueError('Reserve two fallback calls and one repair attempt in the persistent call cap.')


class Pipeline:
    def __init__(self,provider,retriever,store,config=PipelineConfig(),*,on_checkpoint=None,resume=None):
        self.provider,self.retriever,self.store,self.config=provider,retriever,store,config
        self.on_checkpoint=on_checkpoint
        self.resume=resume

    def run(self,run_id: str,image: bytes):
        fingerprint=hashlib.sha256(json.dumps({'image_sha256':hashlib.sha256(image).hexdigest(),
            'model':self.provider.model,'prompt_version':prompts.VERSION,
            'prompt_sha256':hashlib.sha256(Path(prompts.__file__).read_bytes()).hexdigest(),
            'implementation_sha256':hashlib.sha256(b''.join((Path(__file__).parent/name).read_bytes() for name in
                ['pipeline.py','schemas.py','imagine.py','rank.py','retrieval.py','providers.py','store.py','supabase.py','embeddings.py','rerank.py'])).hexdigest(),
            'encoder':{'model':ENCODER_MODEL,'revision':ENCODER_REVISION},
            'vectors_sha256':hashlib.sha256(b''.join(self.retriever.vectors[k].tobytes() for k in sorted(self.retriever.vectors))).hexdigest(),
            'retrieval_backend':getattr(self.retriever,'backend','sqlite-numpy-exact-v1'),
            'corpus':hashlib.sha256(json.dumps(self.retriever.rows,sort_keys=True).encode()).hexdigest(),
            'config':asdict(self.config)},sort_keys=True).encode()).hexdigest()
        if self.resume:self.store.import_resume(run_id,fingerprint,self.resume['checkpoints'],self.resume['model_attempts'])
        if self.store.begin(run_id,fingerprint) is None:return self.store.result(run_id)
        started=time.monotonic();deadline=started+self.config.deadline_seconds

        def checkpoint(stage,value):
            self.store.save(run_id,stage,value)
            if self.on_checkpoint:self.on_checkpoint(stage,value)

        def record(name,step):
            self.store.record(run_id,name,step)
            if self.on_checkpoint:self.on_checkpoint('runtime_receipt',{'steps':self.store.history(run_id)})

        def stage(name,instruction,schema,validator=None,*,visual=False,**data):
            cached=self.store.load(run_id,name)
            if cached is not None:
                value=schema.model_validate(cached)
                if self.on_checkpoint:self.on_checkpoint(name,cached)
                return value
            original=prompts.prompt(instruction,**data);request_prompt=original
            for attempt in range(2):
                if time.monotonic()>deadline:raise ValueError('Pipeline deadline reached.')
                self.store.heartbeat(run_id);self.store.attempt(run_id,self.config.max_attempts)
                step=None;value=None
                try:
                    value,step=self.provider.call(name,request_prompt,schema,image=image if visual else None,
                                                 timeout_seconds=max(1,min(90,deadline-time.monotonic())))
                    if validator:validator(value)
                except Exception as failure:
                    step=getattr(failure,'step',step) or {'stage':name,'error':'validation_failure'}
                    step['validation_failure']=type(failure).__name__
                    record(name,step)
                    if isinstance(failure,ProviderFailure):
                        if attempt==0 and failure.category=='unavailable':time.sleep(1);continue
                        raise
                    # Repair only parse/link validation, once across the entire persisted run.
                    repairable=isinstance(failure,(ValidationError,json.JSONDecodeError)) or value is not None
                    if not repairable or attempt or self.store.load(run_id,'schema_repair_used'):raise
                    checkpoint('schema_repair_used',{'stage':name})
                    detail=str(failure).replace(getattr(self.provider,'key','[no-key]'),'[redacted]')[:500]
                    request_prompt=original+'\nRepair the previous schema/reference error once. Do not invent IDs. '+type(failure).__name__+': '+detail
                    continue
                record(name,step);checkpoint(name,value.model_dump(mode='json'));return value
            raise ValueError('Stage did not produce a valid result.')

        try:
            if self.on_checkpoint:self.on_checkpoint('input_manifest',{'fingerprint':fingerprint})
            # Baseline generation sees only the image and common style constraints, never retrieved material.
            baseline=stage('baseline','Write one funny relevant caption. Return a caption string.',Caption,visual=True).caption
            draft=stage('scene',prompts.SCENE,Scene,visual=True)
            visual_review=stage('conflicts',prompts.CONFLICT,GroundedConflictSet,
                lambda v:validate_links(v.verified_scene,v),visual=True,draft_scene=draft.model_dump())
            scene=visual_review.verified_scene
            # Rejected draft claims remain in the audit checkpoint, not creative-stage context.
            conflicts=ConflictSet(conflicts=visual_review.conflicts)
            image_view=stage('associations_image',prompts.ASSOCIATIONS,AssociationSet,
                lambda v:validate_links(scene,conflicts,v),visual=True,view='image',details=scene.model_dump(),conflicts=conflicts.model_dump())
            description_view=stage('associations_description',prompts.ASSOCIATIONS,AssociationSet,
                lambda v:validate_links(scene,conflicts,v),view='description',scene=scene.model_dump(),conflicts=conflicts.model_dump())
            graph=self.store.load(run_id,'retrieval_graph')
            if graph is None:
                graph=build_graph(scene,conflicts,image_view,description_view,self.retriever,
                    'balanced' if self.config.retrieval_method=='balanced_rerank' else self.config.retrieval_method)
                checkpoint('retrieval_graph',graph)
            paths={p['id']:p for p in graph['paths']};sources=graph['source_ids']
            reranked=self.config.retrieval_method=='balanced_rerank'
            visible_evidence=scene.description+' '+ ' '.join(d.observation for d in scene.details)
            def validate_proposal(v,*,require_prototypes=False):
                subset(v.selected_path_ids,paths,'selected path');subset(v.selected_source_ids,sources,'selected source')
                if reranked:
                    validate_order(v,{key:self.retriever.by_id[key] for key in sources},visible_evidence,expected=len(sources))
                    if require_prototypes and sum(bool(r.transfer_plan and r.transfer_plan.realization) for r in v.ranking)<min(2,len(sources)):
                        raise ValueError('Draft two concrete unreviewed caption prototypes before grading image-to-joke similarity.')
            compact_sources=(source_packet([self.retriever.by_id[key] for key in sources],scene.description) if reranked
                             else [{'id':key,**self.retriever.by_id[key]['annotation']} for key in sources])
            chosen=stage('merge_paths',PATH_INSTRUCTION+PROPOSE_INSTRUCTION if reranked else prompts.MERGE,
                RankedPathChoice if reranked else PathChoice,lambda v:validate_proposal(v,require_prototypes=reranked),visual=True,
                scene=scene.model_dump(),visible_scene=visible_evidence,visible_scene_anchors=scene_anchors(visible_evidence),conflicts=conflicts.model_dump(),paths=list(paths.values()),sources=compact_sources)
            proposed=chosen
            if reranked:
                proposal_errors=[]
                for entry in proposed.ranking:
                    try:
                        validate_transfer_plans(RankedPathChoice(ranking=[entry.model_copy(update={'grade':2})] if entry.transfer_plan else [],selected_path_ids=proposed.selected_path_ids,
                            reason=proposed.reason),{key:self.retriever.by_id[key] for key in sources},scene,require_realization=True)
                    except ValueError as failure:proposal_errors.append({'source_id':entry.source_id,'error':str(failure)})
                chosen=stage('source_review',REVIEW_INSTRUCTION+PATH_INSTRUCTION+RERANK_INSTRUCTION,
                    RankedPathChoice,validate_proposal,visual=True,scene=scene.model_dump(),
                    visible_scene=visible_evidence,visible_scene_anchors=scene_anchors(visible_evidence),
                    conflicts=conflicts.model_dump(),paths=list(paths.values()),sources=compact_sources,
                    proposed=proposed.model_dump(),proposal_validation_errors=proposal_errors)
            tentative,plan_rejections=(generation_plans(proposed,chosen,{key:self.retriever.by_id[key] for key in sources},scene)
                                       if reranked else ({},[]))
            generation_ids=list(tentative) if reranked else chosen.selected_source_ids
            demos,demo_bytes=demonstrations(generation_ids,self.retriever)
            demo_ids=[d['id'] for d in demos]
            source_plans={key:plan for key,plan in tentative.items() if key in demo_ids}
            available_paths=[paths[key] for key in chosen.selected_path_ids]
            if reranked:
                allowed=set(demo_ids)
                available_paths=[p for p in available_paths if not p['source_ids'] or set(p['source_ids'])&allowed]
                if not available_paths:available_paths=[p for p in paths.values() if not p['source_ids']][:2]
                available_paths=[{**p,'source_ids':sorted(set(p['source_ids'])&allowed),
                    'nodes':[{**n,'source_ids':sorted(set(n['source_ids'])&allowed)} for n in p['nodes']]} for p in available_paths]
            generation_path_ids=[p['id'] for p in available_paths]
            def validate_candidates(v):
                validate_links(scene,conflicts,candidates=v,path_ids=generation_path_ids,source_ids=demo_ids)
                if source_plans and sum(bool(c.retrieval_ids) for c in v.candidates)<2:
                    raise ValueError('Attempt at least two source adaptations before the final judge admits or rejects them.')
            candidates=stage('candidates',prompts.GENERATE,CandidateSet,
                validate_candidates,
                visual=True,scene=scene.model_dump(),conflicts=conflicts.model_dump(),paths=available_paths,
                demonstrations=demos,source_transfer_plans=source_plans,
                source_critique=chosen.model_dump() if reranked else None)
            selection=stage('judge',prompts.JUDGE,Selection,
                lambda v:validate_links(scene,conflicts,candidates=candidates,selection=v,path_ids=generation_path_ids,source_ids=demo_ids),
                visual=True,scene=scene.model_dump(),candidates=candidates.model_dump(),
                demonstrations=demos,source_transfer_plans=source_plans)
            filter_inputs=(candidates,selection,[r['text'] for r in self.retriever.rows],scene.image_text,baseline)
            grounded,grounding_rejections=accepted_candidates(*filter_inputs,source_plans=source_plans,scene=scene)
            acceptable,rejections=accepted_candidates(*filter_inputs,require_transfer=reranked,source_plans=source_plans,scene=scene)
            baseline_copy=max((copy_score(baseline,r['text']) for r in self.retriever.rows),default=0)
            baseline_copy=max([baseline_copy]+[copy_score(baseline,t) for t in scene.image_text])
            admitted_evidence=sorted(set(demo_ids)|{key for path in available_paths for key in path['source_ids']})
            retrieval_evidence=(sorted({key for c in acceptable for key in c['verified_source_ids']}) if reranked else admitted_evidence)
            rag_acceptable=acceptable
            guided_mode='rag' if acceptable and retrieval_evidence else None
            fallback=None
            if guided_mode is None and self.config.no_rag_fallback and baseline_copy<0.8:
                # Rebuild ONLY the original independent association paths, never retrieved branches,
                # source plans, critique, prior candidates or source-conditioned judgments.
                fallback_paths=[]
                for view,label in [(image_view,'image'),(description_view,'description')]:
                    for path in view.paths:
                        fallback_paths.append({**path.model_dump(),'id':'p'+str(len(fallback_paths)+1),'origin':label})
                fallback_ids=[p['id'] for p in fallback_paths]
                fresh=stage('fallback_candidates',prompts.FALLBACK_GENERATE,CandidateSet,
                    lambda v:validate_links(scene,conflicts,candidates=v,path_ids=fallback_ids,source_ids=[]),
                    visual=True,scene=scene.model_dump(),conflicts=conflicts.model_dump(),
                    paths=fallback_paths,baseline_to_avoid=baseline)
                verdict=stage('fallback_judge',prompts.FALLBACK_JUDGE,Selection,
                    lambda v:validate_links(scene,conflicts,candidates=fresh,selection=v,path_ids=fallback_ids,source_ids=[]),
                    visual=True,scene=scene.model_dump(),candidates=fresh.model_dump())
                acceptable,fallback_rejections=accepted_candidates(fresh,verdict,
                    [r['text'] for r in self.retriever.rows],scene.image_text,baseline,scene=scene)
                fallback={'reason':'no_qualifying_source_backed_caption','source_free':True,
                    'paths':fallback_paths,'candidates':fresh.model_dump(),'selection':verdict.model_dump(),
                    'acceptable_candidates':acceptable,'rejections':fallback_rejections}
                if acceptable:guided_mode='no_rag_fallback'
            status=('ready' if acceptable and baseline_copy<0.8 and guided_mode else
                    'failed' if self.config.no_rag_fallback else 'degraded')
            result={'status':status,'baseline':baseline,'guided':acceptable[0]['caption'] if status=='ready' else None,
                'guided_mode':guided_mode,'fallback':fallback,'rag_acceptable_candidates':rag_acceptable,
                'metadata':{'title':scene.title,'description':scene.description},'acceptable_candidates':acceptable,
                'verified_scene':scene.model_dump(),'rejected_visual_claims':visual_review.rejected_visual_claims,
                'grounded_candidates':grounded,'grounding_rejections':grounding_rejections,
                'association_only':grounded[0]['caption'] if not acceptable and grounded else None,
                'candidates':candidates.model_dump(),'selection':selection.model_dump(),'rejections':rejections,
                'baseline_copy_score':baseline_copy,'retrieval_ids':sources,'demonstration_ids':demo_ids,'demonstration_bytes':demo_bytes,
                'retrieval_evidence_ids':retrieval_evidence,
                'admitted_source_ids':admitted_evidence,'source_transfer_plans':source_plans,
                'selected_caption_source_ids':acceptable[0]['verified_source_ids'] if status=='ready' else [],
                'reranking':chosen.model_dump(mode='json') if reranked else None,
                'proposed_reranking':proposed.model_dump(mode='json') if reranked else None,
                'source_plan_rejections':plan_rejections,'source_candidate_ids':generation_ids,
                'generation_path_ids':generation_path_ids,
                'reranking_evidence':resolved_evidence(chosen,{key:self.retriever.by_id[key] for key in sources},visible_evidence) if reranked else [],
                'model':self.provider.model,'prompt_version':prompts.VERSION,'config':asdict(self.config),'fingerprint':fingerprint,
                'steps':self.store.history(run_id),'elapsed_ms':round((time.monotonic()-started)*1000),
                'quality_status':'private development output; no human humor/grounding qualification',
                'error_category':None if status=='ready' else 'no_safe_caption',
                'degradation_reason':None if status=='ready' else 'No safe distinct caption passed the bounded generation checks.'}
            self.store.finish(run_id,status,result);return result
        except Exception as failure:
            result={'status':'failed','error_type':type(failure).__name__,
                    'error_category':failure.category if isinstance(failure,ProviderFailure) else 'contract_budget_or_runtime',
                    'fingerprint':fingerprint,'model':self.provider.model,'steps':self.store.history(run_id),
                    'elapsed_ms':round((time.monotonic()-started)*1000)}
            self.store.finish(run_id,'failed',result);return result

"""Deterministic copy/duplicate checks supplement, not replace, visual judgment."""
from difflib import SequenceMatcher
import re
from .schemas import normalize


def tokens(text):return re.findall(r'\w+',text.casefold())


def copy_score(caption,source):
    a,b=tokens(caption),tokens(source)
    if not a or not b:return 0.0
    longest=SequenceMatcher(None,a,b,autojunk=False).find_longest_match().size
    # Short ordinary phrases alone are not proof of copying. Long verbatim spans are held out.
    return max(longest/len(a) if longest>=5 or len(b)<=8 else 0,
               SequenceMatcher(None,normalize(caption),normalize(source),autojunk=False).ratio())


def contains_phrase(text,phrase):
    value,part=tokens(text),tokens(phrase)
    return bool(part) and any(value[i:i+len(part)]==part for i in range(len(value)-len(part)+1))


def grounded_phrase(observation,phrase):
    """Conservative wording coverage, supplementary to the image-conditioned semantic audit.

    Only explicit inflections/equivalents are allowed. This is not an entailment model and does
    not license device identities, tasks, or spatial relations absent from the observation.
    """
    aliases={'standing':'stand','stands':'stand','sitting':'sit','sits':'sit','reaching':'reach',
             'reaches':'reach','couch':'sofa','stuffed':'plush','grey':'gray','cushions':'cushion',
             'toys':'toy','dogs':'dog','bears':'bear','holding':'hold','holds':'hold'}
    aliases.update({'rides':'ride','riding':'ride','wears':'wear','wearing':'wear','presses':'press',
                    'pressing':'press','climbing':'climb','climbs':'climb','falling':'fall','falls':'fall'})
    ignored={'a','an','the','is','are','was','were'}
    def canonical(text):
        # Postural balance on a support is entailed by standing on it; this does not license
        # transitive claims such as balancing an object, a budget, or an unobserved stunt.
        text=re.sub(r'\bbalanc(?:ing|es?) on\b','standing on',text,flags=re.I)
        return [aliases.get(t,t) for t in tokens(text) if t not in ignored]
    value,part=canonical(observation),canonical(phrase)
    if not part or not set(part)<=set(value):return False
    # Noun phrases can invert in possessives: 'sofa cushions' == 'cushions of the sofa'.
    # Preserve subject/object sides around an explicit action or spatial relation instead of
    # imposing English surface word order on every adjective and noun.
    relations={'stand','sit','reach','hold','ride','wear','press','climb','fall','jump','leap',
               'eat','drive','sleep','hug','on','under','above','below','behind','toward'}
    pivot=next((i for i,t in enumerate(part) if t in relations),None)
    if pivot is None:return True
    return any(set(part[:pivot])<=set(value[:i]) and set(part[pivot+1:])<=set(value[i+1:])
               for i,t in enumerate(value) if t==part[pivot])


def accepted_candidates(candidates,selection,source_texts,image_text,baseline,*,require_transfer=False,source_plans=None,scene=None):
    by_id={c.id:c for c in candidates.candidates};accepted=[];rejections=[]
    texts=list(source_texts)+list(image_text)
    for j in sorted(selection.judgments,key=lambda x:x.rank):
        c=by_id[j.candidate_id];score=max((copy_score(c.caption,t) for t in texts),default=0)
        why=[]
        if scene is not None:
            details={d.id:d.observation for d in scene.details}
            for claim in j.literal_claims:
                if (claim.caption_span not in c.caption or claim.detail_id not in c.detail_ids
                        or claim.detail_id not in details or (claim.kind=='literal'
                        and not grounded_phrase(details[claim.detail_id],claim.caption_span))):
                    why.append('unverified_literal_claim');break
        applications={a.source_id:a for a in c.source_applications}
        verified=[]
        if (set(applications)!=set(c.retrieval_ids) or len(applications)!=len(c.source_applications)
                or any(a.caption_span!=c.caption for a in c.source_applications)):
            why.append('invalid_source_application')
        for check in j.source_checks:
            application=applications.get(check.source_id)
            plan=(source_plans or {}).get(check.source_id)
            if (check.supported and check.source_id in c.retrieval_ids and application is not None
                    and application.caption_span in c.caption and plan is not None):
                bridge=plan.get('lexical_bridge',[])
                if plan.get('kind')=='wordplay' and (not bridge or
                        any(term.casefold() not in c.caption.casefold() for term in bridge)):continue
                if plan.get('realization'):
                    spans=[check.setup_span,check.turn_span]
                    if (not all(spans) or spans[0]==spans[1]
                            or any(s not in application.caption_span for s in spans)):continue
                verified.append(check.source_id)
        if require_transfer and not verified:why.append('no_verified_source_transfer')
        if require_transfer and set(c.retrieval_ids)-set(verified):why.append('unsupported_source_transfer')
        if (not j.accepted or not j.detail_ids or not set(j.detail_ids)&set(c.detail_ids)
                or j.unsupported_premises or j.safety_flags):why.append('model_grounding_or_safety_rejection')
        if score>=0.8:why.append('near_copy')
        if normalize(c.caption)==normalize(baseline):why.append('same_as_baseline')
        if any(copy_score(c.caption,x['caption'])>=0.85 for x in accepted):why.append('duplicate_candidate')
        if why:rejections.append({'id':c.id,'reasons':why,'copy_score':score})
        else:accepted.append({**c.model_dump(),'selector_rank':j.rank,'grounding_evidence':j.detail_ids,
                              'verified_source_ids':sorted(set(verified)),'copy_score':score})
    return accepted[:3],rejections

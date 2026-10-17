"""Checkpointed, human-readable submissions for Luna-authored corpus expansion.

This module samples, serializes and validates annotations; it never infers them.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
from .annotations import source_records,read_jsonl,write_jsonl,validate_annotation,MECHANISMS

PROTOCOL='situational-expansion-luna-v3'
DEFAULT_ROOT=Path('.local/humorllm/expansion-3000')
REVIEW_ORIGINS={'reviewer-1':'worker-3','reviewer-2':'worker-1','reviewer-3':'worker-2'}


def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def canonical(text):return ' '.join(re.findall(r'\w+',text.casefold()))
def load_sources(root):return {r['id']:r for r in read_jsonl(root/'sources.jsonl')}
def batches(folder):return [json.loads(p.read_text()) for p in sorted(folder.glob('*.json'))]


def submissions(root,worker):
    return [row for batch in batches(root/worker/'submissions') for row in batch['rows']]


def expand_include(row,source):
    if len(row)!=11 or row[1]!='I':raise ValueError('Include needs exactly eleven columns.')
    _,_,situation,expectation,twist,mechanism,entities,relation,scene,caption,conditions=row
    annotation={'id':source['id'],'text_sha256':source['text_sha256'],'situation':situation,
        'expectation':expectation,'twist':twist,'mechanism':mechanism,'entities':entities,
        'transferability':'situational','risk_flags':[],'decision':'include','reason':relation,'confidence':'medium'}
    validate_annotation(annotation,source)
    if mechanism in {'wordplay','none'}:raise ValueError('Core situational pool cannot use a wordplay/none mechanism.')
    if not isinstance(scene,str) or not 10<=len(scene)<=240:raise ValueError('Hypothetical transfer scene needs 10–240 characters.')
    if not isinstance(caption,str) or not 5<=len(caption)<=240:raise ValueError('Transfer caption needs 5–240 characters.')
    if (not isinstance(conditions,list) or not 1<=len(conditions)<=5 or
        any(not isinstance(c,str) or not 3<=len(c)<=160 for c in conditions)):
        raise ValueError('Record one to five actual mechanism prerequisites.')
    return {'annotation':annotation,'transfer_test':{'relation':relation,'hypothetical_scene':scene,
        'hypothetical_caption':caption,'required_conditions':conditions}}


def validate_rows(rows,expected,sources):
    if not isinstance(rows,list) or not 1<=len(rows)<=30:raise ValueError('Submit 1–30 individually read records.')
    if any(not isinstance(r,list) or len(r)<3 for r in rows):raise ValueError('Each record needs an ID, tag and semantic fields.')
    if [r[0] for r in rows]!=expected[:len(rows)]:raise ValueError('Submission IDs must match the next unread records in order.')
    for row in rows:
        if row[1]=='I':expand_include(row,sources[row[0]])
        elif row[1] in {'W','L','U','X'}:
            if len(row)!=3 or not isinstance(row[2],str) or not 4<=len(row[2])<=180:
                raise ValueError('Skipped records need ID, tag and a source-specific reason (4–180 characters).')
        else:raise ValueError('Unknown decision tag.')


def unread(root,worker):
    assigned=json.loads((root/worker/'assignment.json').read_text())
    done=[r[0] for r in submissions(root,worker)]
    if assigned[:len(done)]!=done:raise ValueError('Non-contiguous submission history.')
    return assigned[len(done):]


def includes(root,worker,*,calibration=False):
    shared=set(json.loads((root/'calibration.json').read_text()))
    return [r for r in submissions(root,worker) if r[1]=='I' and (calibration or r[0] not in shared)]


def prepare(root,source,previous):
    if (root/'manifest.json').exists():raise ValueError('Expansion already prepared; preserve its frozen assignments.')
    rows=source_records(source);prior=read_jsonl(previous);prior_ids={r['id'] for r in prior}
    # Silver calibration labels are hidden from annotators and are not human ground truth.
    groups=[[r for r in prior if r['annotation']['decision']=='include' and r['annotation']['transferability']==kind]
            for kind in ['situational','wordplay_only']]
    groups.append([r for r in prior if r['annotation']['decision']=='exclude'])
    shared=[r['id'] for group in groups for r in sorted(group,key=lambda r:hashlib.sha256(('calibration-v3'+r['id']).encode()).hexdigest())[:10]]
    known=set();remaining=[]
    for row in sorted(rows,key=lambda r:hashlib.sha256(('expansion-v3'+r['id']+r['text_sha256']).encode()).hexdigest()):
        key=canonical(row['text'])
        if row['id'] in prior_ids or key in known:continue
        known.add(key);remaining.append(row['id'])
    root.mkdir(parents=True,exist_ok=True);write_jsonl(root/'sources.jsonl',rows)
    (root/'calibration.json').write_text(json.dumps(shared)+'\n')
    for i in range(3):
        worker=root/f'worker-{i+1}';worker.mkdir(exist_ok=True)
        (worker/'assignment.json').write_text(json.dumps(shared+remaining[i::3])+'\n')
    manifest={'protocol':PROTOCOL,'source_sha256':digest(source),'sources':len(rows),
        'previous_ids_excluded':len(prior_ids),'remaining_after_canonical_dedup':len(remaining),
        'calibration_shared':len(shared),'target_new_situational':3000,'initial_include_quota_per_worker':1250,
        'model_requested':'gpt-6-luna','human_reviewed':False,'production_eligible':False,
        'authorization':'User requested at least 3000 transferable jokes and chose GPT-6 Luna sub-agents.',
        'raw_source_limit':len(remaining),'source_sampling':'Deterministic SHA-256 order; prior 1000 excluded; source labels hidden.'}
    (root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest


def commit(root,worker,batch):
    rows=json.loads(batch.read_text());sources=load_sources(root);expected=unread(root,worker)
    validate_rows(rows,expected,sources)
    folder=root/worker/'submissions';folder.mkdir(exist_ok=True)
    path=folder/f'{len(batches(folder))+1:05d}.json'
    if path.exists():raise ValueError('Refusing to overwrite a submission.')
    payload={'protocol':PROTOCOL,'worker':worker,'model_requested':'gpt-6-luna','rows':rows,
        'source_hashes':{r[0]:sources[r[0]]['text_sha256'] for r in rows}}
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(payload,ensure_ascii=False)+'\n');temp.replace(path)
    return {'submitted':len(rows),'total_processed':len(submissions(root,worker)),
            'new_include_candidates':len(includes(root,worker)),'next_unread':len(unread(root,worker))}


def review_records(root,reviewer):
    return [row for batch in batches(root/reviewer/'reviews') for row in batch['rows']]


def review_queue(root,origin,reviewer):
    if REVIEW_ORIGINS.get(reviewer)!=origin:raise ValueError('Use the assigned cross-reviewer; self-review is not qualification.')
    candidates=includes(root,origin);done=[r[0] for r in review_records(root,reviewer)]
    if [r[0] for r in candidates[:len(done)]]!=done:raise ValueError('Reviewer queue changed; preserve accepted source order.')
    return candidates[len(done):]


def commit_review(root,origin,reviewer,path):
    rows=json.loads(path.read_text());expected=review_queue(root,origin,reviewer)
    if not isinstance(rows,list) or not 1<=len(rows)<=30:raise ValueError('Review 1–30 records at a time.')
    if [r[0] for r in rows]!=[r[0] for r in expected[:len(rows)]]:raise ValueError('Review IDs do not match next candidates.')
    for row in rows:
        if row[1]=='A':
            if len(row)!=5:raise ValueError('Accept needs ID, A, reason, alternate scene, alternate caption.')
            for value,minimum,maximum in [(row[2],4,180),(row[3],10,240),(row[4],5,240)]:
                if not isinstance(value,str) or not minimum<=len(value)<=maximum:raise ValueError('Invalid acceptance transfer test.')
        elif row[1] in {'R','X'}:
            if len(row)!=3 or not isinstance(row[2],str) or not 4<=len(row[2])<=180:raise ValueError('Rejection/review needs a specific reason.')
        else:raise ValueError('Unknown review verdict.')
    folder=root/reviewer/'reviews';folder.mkdir(parents=True,exist_ok=True)
    target=folder/f'{len(batches(folder))+1:05d}.json';temp=target.with_suffix('.tmp')
    temp.write_text(json.dumps({'protocol':PROTOCOL,'origin':origin,'reviewer':reviewer,'rows':rows},ensure_ascii=False)+'\n');temp.replace(target)
    completed=review_records(root,reviewer)
    return {'reviewed':len(completed),'verdicts':dict(Counter(r[1] for r in completed))}


def status(root):
    return {f'worker-{i}':{'processed':len(submissions(root,f'worker-{i}')),
        'new_include_candidates':len(includes(root,f'worker-{i}')),
        'decisions':dict(Counter(r[1] for r in submissions(root,f'worker-{i}')))} for i in range(1,4)}


def review_progress(root):
    """Checkpoint counts only; export and overlap audit remain separate gates."""
    override=root/'coordinator-quarantine.jsonl'
    quarantined={r['id'] for r in read_jsonl(override)} if override.exists() else set()
    workers={};accepted=[];seen=set()
    for reviewer,origin in REVIEW_ORIGINS.items():
        authored=includes(root,origin);reviews=review_records(root,reviewer)
        if [r[0] for r in reviews]!=[r[0] for r in authored[:len(reviews)]]:
            raise ValueError('Review/source alignment changed.')
        verdicts=Counter(r[1] for r in reviews)
        for review in reviews:
            if review[1]=='A' and review[0] not in quarantined:
                if review[0] in seen:raise ValueError('Repeated reviewed source ID.')
                seen.add(review[0]);accepted.append(review[0])
        workers[origin]={'candidates':len(authored),'reviewed':len(reviews),
                         'pending_review':len(authored)-len(reviews),'verdicts':dict(verdicts)}
    return {'workers':workers,'new_candidates':sum(w['candidates'] for w in workers.values()),
            'reviewed':sum(w['reviewed'] for w in workers.values()),
            'accepted_after_coordinator_quarantine':len(accepted),
            'coordinator_quarantine_count':len(quarantined),
            'status':'Checkpoint counts only; export identity checks, final duplicate audit and database verification are separate gates.'}


def export_corpus(root,previous,destination,*,target=3000):
    """Count only two-pass situational records; preserve legacy wordplay as a side pool."""
    sources=load_sources(root);prior=read_jsonl(previous);prior_ids={r['id'] for r in prior}
    core=[];quarantined=[];seen_ids=set();seen_text=set()
    override_path=root/'coordinator-quarantine.jsonl'
    overrides={r['id']:r for r in read_jsonl(override_path)} if override_path.exists() else {}
    # Preserve old reviewed includes and their exact annotations; low/uncertain are archived, not retrieved.
    legacy=[r for r in prior if r['id'] not in overrides and r['annotation']['decision']=='include' and not r['annotation']['risk_flags']
            and r['annotation']['transferability'] in {'situational','wordplay_only'}]
    for row in legacy:seen_text.add(canonical(row['text']))
    for reviewer,origin in REVIEW_ORIGINS.items():
        authored=includes(root,origin)
        for batch in batches(root/origin/'submissions'):
            for item in batch['rows']:
                source=sources[item[0]]
                if batch['source_hashes'].get(item[0])!=source['text_sha256']:
                    raise ValueError('Submitted source hash changed.')
                if hashlib.sha256(source['text'].encode()).hexdigest()!=source['text_sha256']:
                    raise ValueError('Source text hash changed.')
        reviews=review_records(root,reviewer)
        if [r[0] for r in reviews]!=[r[0] for r in authored[:len(reviews)]]:
            raise ValueError('Review/source alignment changed.')
        for row,review in zip(authored,reviews):
            source=sources[row[0]]
            if source['id'] in prior_ids or source['id'] in seen_ids:raise ValueError('Repeated or prior ID in new candidates.')
            seen_ids.add(source['id'])
            record=expand_include(row,source)
            if source['id'] in overrides:
                quarantined.append(overrides[source['id']]);continue
            if review[1]!='A':quarantined.append({'id':source['id'],'review':review});continue
            key=canonical(source['text'])
            if key in seen_text:quarantined.append({'id':source['id'],'reason':'canonical_text_duplicate'});continue
            seen_text.add(key)
            core.append({**source,**record,'review_transfer_test':{'hypothetical_scene':review[3],
                'hypothetical_caption':review[4],'reason':review[2]},
                'annotation_provenance':{'model_requested':'gpt-6-luna','protocol':PROTOCOL,'author':origin,'reviewer':reviewer},
                'review':{'coordinator_reviewed':False,'independent_model_reviewed':True,'protocol':PROTOCOL,
                    'scope':'Luna source interpretation and cross-worker semantic/substitution review; not human approval.',
                    'human_reviewed':False},'production_eligible':False})
    if len(core)<target:raise ValueError(f'Only {len(core)} reviewed new situational records; target is {target}.')
    result={'protocol':PROTOCOL,'new_reviewed_situational':len(core),'legacy_records':len(legacy),
        'legacy_quarantined_ids':sorted(prior_ids & overrides.keys()),
        'total_records':len(core)+len(legacy),'total_situational':len(core)+sum(r['annotation']['transferability']=='situational' for r in legacy),
        'legacy_wordplay_only':sum(r['annotation']['transferability']=='wordplay_only' for r in legacy),
        'quarantined':len(quarantined),'human_reviewed':False,'production_eligible':False,
        'deduplication':'Exact canonical word sequence; further near-duplicate audit required before activation.'}
    write_jsonl(destination,sorted(legacy+core,key=lambda r:r['id']))
    write_jsonl(root/'review-quarantine.jsonl',quarantined)
    result['corpus_sha256']=digest(destination)
    (root/'export-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=DEFAULT_ROOT)
    sub=p.add_subparsers(dest='command',required=True)
    prep=sub.add_parser('prepare');prep.add_argument('--source',type=Path,required=True);prep.add_argument('--previous',type=Path,required=True)
    for name in ['next','submit']:
        q=sub.add_parser(name);q.add_argument('--worker',required=True,choices=['worker-1','worker-2','worker-3'])
        if name=='next':q.add_argument('--limit',type=int,default=30)
        else:q.add_argument('--batch',type=Path,required=True)
    for name in ['next-review','submit-review']:
        q=sub.add_parser(name);q.add_argument('--origin',required=True);q.add_argument('--reviewer',required=True)
        if name=='next-review':q.add_argument('--limit',type=int,default=20)
        else:q.add_argument('--batch',type=Path,required=True)
    out=sub.add_parser('export');out.add_argument('--previous',type=Path,required=True)
    out.add_argument('--destination',type=Path,required=True);out.add_argument('--target',type=int,default=3000)
    sub.add_parser('status');sub.add_parser('progress');a=p.parse_args();root=a.root
    if a.command=='prepare':result=prepare(root,a.source,a.previous)
    elif a.command=='submit':result=commit(root,a.worker,a.batch)
    elif a.command=='status':result=status(root)
    elif a.command=='progress':result=review_progress(root)
    elif a.command=='export':result=export_corpus(root,a.previous,a.destination,target=a.target)
    elif a.command=='next':
        if not 1<=a.limit<=30:raise ValueError('Read batches of 1–30.')
        sources=load_sources(root);result=[[key,sources[key]['text']] for key in unread(root,a.worker)[:a.limit]]
    elif a.command=='next-review':
        if not 1<=a.limit<=30:raise ValueError('Review batches of 1–30.')
        sources=load_sources(root);result=[]
        for row in review_queue(root,a.origin,a.reviewer)[:a.limit]:
            result.append({'id':row[0],'text':sources[row[0]]['text'],**expand_include(row,sources[row[0]])})
    else:result=commit_review(root,a.origin,a.reviewer,a.batch)
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()

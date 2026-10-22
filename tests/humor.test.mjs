import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeReturn, parsePlan, parseCandidates, normalizeCaption, captionMethod } from '../lib/humor/schemas.ts';
import { generatePair } from '../lib/humor/pipeline.ts';
const plan={title:'Cat on a keyboard',description:'A cat is asleep on an open laptop keyboard.',details:[{id:'d1',observation:'A cat is asleep on a keyboard.'}],conflicts:['Present at work but asleep.'],angles:[{idea:'Attendance versus contribution',detail_ids:['d1']},{idea:'Paid naps',detail_ids:['d1']},{idea:'Keyboard shortcut',detail_ids:['d1']}]};
const candidates={candidates:[{id:'a',caption:'Perfect attendance. Questionable contribution.',detail_ids:['d1']},{id:'b',caption:'My out-of-office reply has a fur coat.',detail_ids:['d1']},{id:'c',caption:'Finally, a meeting that could have been a nap.',detail_ids:['d1']}],selected_id:'a'};
function response(output){return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(output)}]}],usage:{total_tokens:100}})}
test('method labels follow either randomized assignment and remain absent without a revealed mapping',()=>{
 assert.equal(captionMethod('A','A'),'Baseline'); assert.equal(captionMethod('B','A'),'HOMER-inspired');
 assert.equal(captionMethod('A','B'),'HOMER-inspired'); assert.equal(captionMethod('B','B'),'Baseline');
 assert.equal(captionMethod('A',undefined),null); assert.equal(captionMethod('B',undefined),null);
});
test('image analysis requires bounded generated metadata before publishing',()=>{
 assert.throws(()=>parsePlan({...plan,title:undefined})); assert.throws(()=>parsePlan({...plan,description:''}));
 assert.throws(()=>parsePlan({...plan,title:'x'.repeat(101)})); assert.throws(()=>parsePlan({...plan,description:'x'.repeat(301)}));
 assert.throws(()=>parsePlan({...plan,title:'<script>'}));
});
test('login return destinations cannot escape the app or enter API/auth routes',()=>{
 assert.equal(safeReturn('/upload'),'/upload'); assert.equal(safeReturn('/runs/77777777-7777-4777-8777-777777777777'),'/runs/77777777-7777-4777-8777-777777777777');
 for(const s of ['//evil.test','https://evil.test','/\\evil.test','/%2f%2fevil.test','/api/humor','/auth/callback','/runs/x','/members?next=https://evil.test']) assert.equal(safeReturn(s),'/members');
});
test('candidate selection must refer to unique captions grounded in the validated plan',()=>{
 assert.deepEqual(parsePlan(plan),plan); assert.deepEqual(parseCandidates(candidates,plan),candidates);
 assert.throws(()=>parseCandidates({...candidates,selected_id:'missing'},plan));
 assert.throws(()=>parseCandidates({...candidates,candidates:candidates.candidates.map(c=>({...c,detail_ids:['invented']}))},plan));
 assert.throws(()=>parseCandidates({...candidates,candidates:candidates.candidates.map(c=>({...c,caption:'Same joke.'}))},plan));
 assert.throws(()=>parsePlan({...plan,angles:plan.angles.map(a=>({...a,detail_ids:['invented']}))}));
 assert.equal(normalizeCaption('Hello, WORLD!'),'helloworld');
});
test('three-call pipeline keeps baseline independent and saves the selected guided output',async()=>{
 const calls=[]; const saved=[];
 const result=await generatePair(Buffer.from('fixture-image'),'fixture-secret',{onStep:async s=>saved.push(s),request:async(url,options)=>{
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions'); const body=JSON.parse(options.body); calls.push(body);
  assert.equal(body.store,false);assert.equal(body.input[1].data,Buffer.from('fixture-image').toString('base64'));
  if(body.response_format.schema.required.includes('caption')){assert.doesNotMatch(body.input[0].text,/VISUAL PLAN/);return response({caption:'Professional napper, amateur employee.'});}
  if(body.response_format.schema.required.includes('details'))return response(plan);
  assert.match(body.input[0].text,/VISUAL PLAN/);return response(candidates);
 }});
 assert.equal(calls.length,3); assert.equal(saved.length,3); assert.equal(result.guided,candidates.candidates[0].caption); assert.equal(result.attempts,3);
 assert.deepEqual(result.metadata,{title:plan.title,description:plan.description});
 assert.equal(new Set(calls.map(c=>c.model)).size,1);
});
test('bad provider output is bounded and secret response bodies never enter errors or traces',async()=>{
 const saved=[];let count=0;
 await assert.rejects(generatePair(Buffer.from('x'),'credential',{onStep:async s=>saved.push(s),request:async()=>{count++;return new Response('sensitive-provider-body credential',{status:500});}}),/Gemini/);
 assert.ok(count<=4);assert.doesNotMatch(JSON.stringify(saved),/sensitive-provider-body|credential/);
});
test('one malformed response can be repaired without silently publishing invalid candidates',async()=>{
 let malformed=false;
 const result=await generatePair(Buffer.from('x'),'test',{request:async(_,options)=>{
 const body=JSON.parse(options.body);
 if(body.response_format.schema.required.includes('caption')) return response({caption:'The office has a strict nap policy.'});
 if(body.response_format.schema.required.includes('details')) return response(plan);
 if(!malformed){malformed=true;return response({...candidates,selected_id:'missing'});}return response(candidates);
 }});
 assert.equal(result.attempts,4);assert.equal(result.guided,candidates.candidates[0].caption);
});
test('quota errors stop retrying and save only bounded diagnostic fields',async()=>{
 const saved=[];let count=0;
 await assert.rejects(generatePair(Buffer.from('x'),'credential',{onStep:async s=>saved.push(s),request:async()=>{count++;return Response.json({error:{status:'RESOURCE_EXHAUSTED',message:'quota secret credential',details:[{violations:[{quotaId:'GenerateRequestsPerDay'}]},{retryDelay:'60s'}]}},{status:429});}}),/quota limit/);
 assert.equal(count,2);assert.equal(saved[0].provider_failure.http_status,429);assert.equal(saved[0].provider_failure.retry_seconds,60);assert.deepEqual(saved[0].provider_failure.quota_ids,['GenerateRequestsPerDay']);assert.doesNotMatch(JSON.stringify(saved),/secret|credential/);
});
test('a duplicate final pair triggers replacement, never a fabricated second caption',async()=>{
 let selectionCalls=0;
 const result=await generatePair(Buffer.from('x'),'test',{request:async(_,options)=>{
 const b=JSON.parse(options.body);
 if(b.response_format.schema.required.includes('caption'))return response({caption:candidates.candidates[0].caption});
 if(b.response_format.schema.required.includes('details'))return response(plan);
 selectionCalls++;return response(selectionCalls===1?candidates:{...candidates,selected_id:'b'});
 }});
 assert.equal(result.attempts,4);assert.notEqual(result.baseline,result.guided);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { captionSchema,inputSchema,validOptions,normalizeVector,diversify,wordCount,MAX_WORDS,MAX_CHARS,editSchema } from '../lib/cowriter/contracts.ts';
import { editPrompt,interpretationPrompt } from '../lib/cowriter/prompts.ts';
import { generate } from '../lib/cowriter/provider.ts';
import { z } from 'zod';
test('hard caption bounds reject verbose outputs without truncating punchlines',()=>{
 assert.equal(captionSchema.safeParse('Put my name on it.').success,true);
 assert.equal(captionSchema.safeParse('word '.repeat(20)).success,true);
 assert.equal(captionSchema.safeParse('word '.repeat(21)).success,false);
 assert.equal(captionSchema.safeParse('a'.repeat(201)).success,false);
 assert.equal(captionSchema.safeParse('setup\npunchline').success,false);
});
test('mode contract requires a private upload only for picture mode',()=>{
 assert.equal(inputSchema.safeParse({mode:'pic',text:''}).success,false);
 assert.equal(inputSchema.safeParse({mode:'thought',text:'My unearned confidence'}).success,true);
 assert.equal(inputSchema.safeParse({mode:'thought',text:' '}).success,false);
});
test('invalid IDs and duplicates cannot be rendered as complete options',()=>{
 const a={image_id:'allowed',caption:'Put my name on it.',angle:'credit',intent_bridge:'unearned credit',preserve_on_edit:'claims credit'};
 const result=validOptions({options:[a,{...a,caption:'PUT MY NAME ON IT!'},{...a,image_id:'invented',caption:'Something else'}]},new Set(['allowed']));
 assert.equal(result.length,1);
});
test('retrieval keeps vector dimensions and distinct media families',()=>{
 assert.throws(()=>normalizeVector([1,2]));assert.throws(()=>normalizeVector(Array(768).fill(0)));
 const v=normalizeVector(Array(768).fill(2));assert.ok(Math.abs(v.reduce((s,x)=>s+x*x,0)-1)<1e-8);
 assert.deepEqual(diversify([{id:'1',family:'a'},{id:'2',family:'a'},{id:'3',family:'b'}]).map(i=>i.id),['1','3']);
});
test('wording and new-angle operations have different invariants',()=>{
 assert.match(editPrompt({}, {visual_anchors:[]}, {}, 'shorter'),/Preserve the selected image, target, comic premise/);
 assert.match(editPrompt({}, {visual_anchors:[]}, {}, 'new_angle'),/Change the comic premise/);
 assert.match(interpretationPrompt({mode:'thought',text:'management'}),/Do not let abstraction replace it/);
});
test('provider uses one request, validates schema and records failure without leaking credentials',async()=>{
 let calls=0;const timings=[];
 await assert.rejects(generate('test',z.object({x:z.string()}),'secret',AbortSignal.timeout(1000),undefined,t=>timings.push(t),'compose',async()=>{calls++;return Response.json({steps:[{type:'model_output',content:[{type:'text',text:'{"x":2}'}]}]});}),/incomplete/);
 assert.equal(calls,1);assert.equal(timings[0].outcome,'error');assert.equal(JSON.stringify(timings).includes('secret'),false);
});

test('both directions are supported while the twenty-word limit remains global',()=>{
 const base={requestId:'00000000-0000-4000-8000-000000000001',sessionId:'00000000-0000-4000-8000-000000000002',revision:1,optionId:'00000000-0000-4000-8000-000000000003'};
 assert.equal(MAX_WORDS,20);assert.equal(MAX_CHARS,200);
 for(const operation of ['shorter','longer','less_obvious','more_obvious','less_mean','more_mean'])assert.equal(editSchema.safeParse({...base,operation}).success,true);
 assert.equal(editSchema.safeParse({...base,operation:'manual',caption:'word '.repeat(21)}).success,false);
 assert.equal(wordCount('  one   two three  '),3);
});

test('length controls refuse limit crossings and failed direction without truncation',async()=>{
 const {lengthEditError}=await import('../lib/cowriter/contracts.ts');
 assert.match(lengthEditError('longer','one '.repeat(20)),/20-word/);
 assert.match(lengthEditError('shorter','Approved.'),/one word/);
 assert.match(lengthEditError('longer','My work here is done.','All done.'),/did not get longer/);
 assert.match(lengthEditError('shorter','Approved. Obviously.','Approved. Obviously.'),/did not get shorter/);
 assert.equal(lengthEditError('longer','one '.repeat(19),'one '.repeat(20)),undefined);
 assert.match(lengthEditError('longer','one '.repeat(19),'one '.repeat(21)),/20 words/);
 assert.equal(lengthEditError('more_mean','Another meeting.','Another meeting about the last meeting.'),undefined);
});
test('catalog paths only resolve managed IDs or content hashes',async()=>{
 const {catalogAsset}=await import('../lib/cowriter/contracts.ts');
 assert.deepEqual(catalogAsset('a'.repeat(64)+'.jpg'),{bucket:'catalog',path:'a'.repeat(64)+'.jpg'});
 const path='managed/00000000-0000-4000-8000-000000000001.jpg';assert.deepEqual(catalogAsset(path),{bucket:'funny-library',path});
 for(const path of ['../../.env','managed/../../user.jpg','https://example.test/a.jpg','managed/00000000-0000-4000-8000-000000000001.jpg?secret=1'])assert.equal(catalogAsset(path),null);
});
test('private model diagnostics retain structured output but exclude credentials and image bytes',async()=>{
 const timings=[],image=Buffer.from('image bytes that must never enter diagnostics');let sent;
 const result=await generate('P'.repeat(17000),z.object({text:z.string()}),'api-secret',AbortSignal.timeout(1000),image,t=>timings.push(t),'compose',async(url,init)=>{sent=JSON.parse(init.body);return Response.json({output_text:JSON.stringify({text:'Approved.'}),usage:{total_tokens:18}});},'gemini-custom');
 assert.equal(result.text,'Approved.');assert.equal(sent.model,'gemini-custom');
 assert.equal(timings.length,1);assert.deepEqual(timings[0].response,{text:'Approved.'});assert.equal(timings[0].request.prompt.length,16000);assert.equal(timings[0].request.prompt_truncated,true);assert.equal(timings[0].request.has_image,true);
 assert.equal(JSON.stringify(timings).includes('api-secret'),false);assert.equal(JSON.stringify(timings).includes(image.toString('base64')),false);
 assert.deepEqual(timings[0].usage,{total_tokens:18});
});
test('diagnostics preserve a bounded invalid response without leaking provider transport errors',async()=>{
 const timings=[];
 await assert.rejects(generate('test',z.object({x:z.number()}),'api-secret',AbortSignal.timeout(1000),undefined,t=>timings.push(t),'compose',async()=>Response.json({output_text:JSON.stringify({x:'large'.repeat(5000)})})),/incomplete/);
 assert.equal(timings[0].response.truncated,true);assert.equal(timings[0].response.preview.length,16000);
 const failed=[];
 await assert.rejects(generate('test',z.object({x:z.string()}),'api-secret',AbortSignal.timeout(1000),undefined,t=>failed.push(t),'compose',async()=>{throw new Error('upstream api-secret network detail');}),/incomplete/);
 assert.equal(failed[0].outcome,'error');assert.equal(JSON.stringify(failed).includes('api-secret'),false);
});

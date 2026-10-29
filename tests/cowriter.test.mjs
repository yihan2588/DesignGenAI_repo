import test from 'node:test';
import assert from 'node:assert/strict';
import { captionSchema,inputSchema,validOptions,normalizeVector,diversify } from '../lib/cowriter/contracts.ts';
import { editPrompt,interpretationPrompt } from '../lib/cowriter/prompts.ts';
import { generate } from '../lib/cowriter/provider.ts';
import { z } from 'zod';
test('hard caption bounds reject verbose outputs without truncating punchlines',()=>{
 assert.equal(captionSchema.safeParse('Put my name on it.').success,true);
 assert.equal(captionSchema.safeParse('word '.repeat(15)).success,false);
 assert.equal(captionSchema.safeParse('a'.repeat(91)).success,false);
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
test('provider uses one request, validates schema and records failure without exposing payload',async()=>{
 let calls=0;const timings=[];
 await assert.rejects(generate('test',z.object({x:z.string()}),'secret',AbortSignal.timeout(1000),undefined,t=>timings.push(t),'compose',async()=>{calls++;return Response.json({steps:[{type:'model_output',content:[{type:'text',text:'{"x":2}'}]}]});}),/incomplete/);
 assert.equal(calls,1);assert.equal(timings[0].outcome,'error');assert.equal(JSON.stringify(timings).includes('secret'),false);
});

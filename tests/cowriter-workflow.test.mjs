import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {writeDraft} from '../lib/cowriter/workflow.ts';import {renderMeme} from '../lib/cowriter/render.ts';import {captionLayout} from '../lib/cowriter/layout.ts';import {captionSchema} from '../lib/cowriter/contracts.ts';
const intent={target:'work',spirit:'unearned confidence',explicit_constraints:[],visual_anchors:['raised thumb'],angles:['credit','delay'],search_queries:{topic:'work',relationship:'unearned credit',visual_analogy:'idle person gesturing triumphantly'}};
const option=(id,caption)=>({image_id:id,caption,angle:'credit',intent_bridge:'unearned credit',preserve_on_edit:'credit claim'});
const options=[option('one','The vision was mine.'),option('two','Put it on my résumé.'),option('three','That concludes my contribution.')];
test('thought workflow has two generation calls and one embedding batch, with three distinct trusted images',async()=>{
 const calls=[],stages=[];let retrieved;
 const request=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body});if(url.includes('batchEmbed'))return Response.json({embeddings:[0,1,2].map(()=>({values:Array.from({length:768},(_,i)=>i===0?1:0)}))});return Response.json({output_text:JSON.stringify(calls.length===1?intent:{options})});};
 const result=await writeDraft({input:{mode:'thought',text:'My contribution to the group project',locks:''},apiKey:'test',signal:AbortSignal.timeout(2000),request,onStage:s=>stages.push(s),retrieve:async(v,q)=>{retrieved={v,q};return ['one','two','three'].map(id=>({id,family:id,description:id}));}});
 assert.equal(calls.length,3);assert.equal(result.options.length,3);assert.equal(retrieved.v.length,3);assert.match(retrieved.q[0],/group project/);assert.equal(retrieved.q[1],'unearned credit');assert.equal(stages.length,3);
 assert.equal(calls[0].body.store,false);assert.equal(JSON.stringify(calls).includes('test'),false);
});
test('picture workflow sends image on both calls, does not retrieve, and will not invent a valid image',async()=>{
 let count=0;const image=Buffer.from('fixture');
 await assert.rejects(writeDraft({input:{mode:'pic',text:'',locks:'',uploadPath:'local'},image,apiKey:'test',signal:AbortSignal.timeout(2000),retrieve:async()=>assert.fail('Picture mode must not search'),request:async(url,init)=>{count++;assert.equal(JSON.parse(init.body).input[1].data,image.toString('base64'));return Response.json({output_text:JSON.stringify(count===1?intent:{options})});}}),/None of these takes/);
 assert.equal(count,2);
});
test('controlled retrieval ablation reuses intent and changes only the search queries',async()=>{
 let queries,calls=0;
 await writeDraft({input:{mode:'thought',text:'actual target',locks:''},intentOverride:intent,queryStrategy:'literal',apiKey:'test',signal:AbortSignal.timeout(2000),request:async(url)=>{calls++;return url.includes('batchEmbed')?Response.json({embeddings:[0,1,2].map(()=>({values:Array(768).fill(1)}))}):Response.json({output_text:JSON.stringify({options})});},retrieve:async(v,q)=>{queries=q;return ['one','two','three'].map(id=>({id,family:id,description:id}));}});
 assert.deepEqual(queries,['actual target','actual target','actual target']);assert.equal(calls,2);
});
test('export renders decoded non-square media and safe glyph paths with the same layout as preview',async()=>{
 const source=await sharp({create:{width:240,height:400,channels:3,background:'#ccddaa'}}).png().toBuffer();
 const caption='R&D says “yes”. <Management agrees>';
 const png=await renderMeme(source,caption),meta=await sharp(png).metadata(),layout=captionLayout(caption,240,400);
 assert.equal(meta.format,'png');assert.equal(meta.width,960);assert.equal(meta.height,layout.height);assert.equal(layout.photoHeight,900);
 assert.equal(captionSchema.safeParse('A résumé with confidence.').success,true);assert.equal(captionSchema.safeParse('🙂').success,false);
 assert.ok(captionLayout('W'.repeat(90),960,540).lines.length>1);
});

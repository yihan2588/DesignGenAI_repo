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
 await assert.rejects(writeDraft({input:{mode:'pic',text:'',locks:'',uploadPath:'local'},image,apiKey:'test',signal:AbortSignal.timeout(2000),retrieve:async()=>assert.fail('Picture mode must not search'),request:async(url,init)=>{count++;assert.equal(JSON.parse(init.body).input[1].data,image.toString('base64'));return Response.json({output_text:JSON.stringify(count===1?intent:{options})});}}),/incomplete result/);
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

test('the saved runtime selects both generation calls and injects examples only into composition',async()=>{
 const calls=[];const runtime={model:'gemini-configured',config_version:'fixture-1',examples:[{id:'00000000-0000-4000-8000-000000000001',intent:'unused credit',image_description:'An idle colleague watching a team',caption:'I supervised the outcome.'}]};
 const result=await writeDraft({input:{mode:'pic',text:'teamwork',locks:'',uploadPath:'fixture'},image:Buffer.from('picture'),runtime,apiKey:'key',signal:AbortSignal.timeout(2000),retrieve:async()=>assert.fail('No retrieval in picture mode'),request:async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);return Response.json({output_text:JSON.stringify(calls.length===1?intent:{options:[option('upload','Put my name on it.')]})});}});
 assert.equal(result.options.length,1);assert.deepEqual(calls.map(x=>x.model),['gemini-configured','gemini-configured']);assert.equal(calls[0].input[0].text.includes('I supervised the outcome.'),false);assert.equal(calls[1].input[0].text.includes('I supervised the outcome.'),true);assert.equal(calls.length,2);
});
test('PNG rendering independently rejects captions beyond twenty words',async()=>{
 const image=await sharp({create:{width:80,height:80,channels:3,background:'#cccccc'}}).jpeg().toBuffer();
 await assert.rejects(renderMeme(image,'word '.repeat(21)),/20 words/);
 const png=await renderMeme(image,'word '.repeat(20));assert.equal((await sharp(png).metadata()).format,'png');
});

test('admin workflow manifest matches the generation source fingerprint',async()=>{
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const manifest=JSON.parse(await readFile(new URL('../lib/cowriter/workflow-manifest.json',import.meta.url),'utf8'));const hash=createHash('sha256');
 for(const file of manifest.sourceFiles)hash.update(file).update(await readFile(new URL('../lib/cowriter/'+file,import.meta.url)));
 assert.equal(manifest.sourceHash,hash.digest('hex'),'Regenerate the workflow manifest after a prompt/provider change.');
 assert.equal(manifest.maxWords,20);assert.equal(manifest.generationCalls.draft,2);assert.equal(manifest.generationCalls.automaticRetries,0);
});

test('thought composition constrains image IDs and excludes picture-mode instructions',async()=>{
 let composition;
 await writeDraft({input:{mode:'thought',text:'The professor only reads slides',locks:''},intentOverride:intent,apiKey:'x',signal:AbortSignal.timeout(2000),retrieve:async()=>['one','two','three'].map(id=>({id,family:id,description:id})),request:async(url,init)=>{
  if(url.includes('batchEmbed'))return Response.json({embeddings:[0,1,2].map(()=>({values:Array(768).fill(1)}))});
  composition=JSON.parse(init.body);return Response.json({output_text:JSON.stringify({options})});
 }});
 assert.deepEqual(composition.response_format.schema.properties.options.items.properties.image_id.enum,['one','two','three']);
 assert.doesNotMatch(composition.input[0].text,/image_id "upload"/);
});
test('gallery layouts use constant frames and fit long captions',async()=>{
 const {galleryLayout}=await import('../lib/cowriter/layout.ts');
 for(const text of ['Noted.', 'word '.repeat(20), 'W'.repeat(200)]){
  const l=galleryLayout(text);assert.equal(l.height,1040);assert.equal(l.photoHeight,720);assert.ok(l.lines.length<=4);
 }
});

import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomInt} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {writeDraft} from '../lib/cowriter/workflow.ts';
import {generate} from '../lib/cowriter/provider.ts';
import {interpretationPrompt} from '../lib/cowriter/prompts.ts';
import {intentSchema,INDEX_VERSION,MODEL,VERSION} from '../lib/cowriter/contracts.ts';
import {renderMeme} from '../lib/cowriter/render.ts';
import {evaluationDatabase} from './evaluation-db.mjs';
import {reviewSheet} from './review-sheet.mjs';
process.loadEnvFile('.env.local');
const tasksFile=process.argv[2]??'docs/evaluation/tasks.json';
const out=process.argv[3]??`.cowriter-cache/evaluation-${Date.now()}`;
const tasks=JSON.parse(await readFile(tasksFile,'utf8'));
const records=JSON.parse(await readFile('.cowriter-cache/records.json','utf8'));
const db=await evaluationDatabase(records);
const results=[],blind=[],key=[];
const hash=data=>createHash('sha256').update(data).digest('hex');
const promptHash=hash(await readFile('lib/cowriter/prompts.ts'));
const catalogHash=hash(JSON.stringify(records.map(r=>[r.id,r.source_hash,r.family,r.index_version]).sort()));
await mkdir(out,{recursive:true});
try{for(const task of tasks){
 const input={mode:task.mode,text:task.text,locks:task.locks??'',...(task.mode==='pic'?{uploadPath:'offline/fixture.jpg'}:{})};
 const image=task.mode==='pic'?await readFile(path.join('public/catalog',task.image)):undefined;
 let intentOverride,commonTimings=[],commonError;
 if(task.mode==='thought')try{intentOverride=await generate(interpretationPrompt(input),intentSchema,process.env.GEMINI_API_KEY,AbortSignal.timeout(15000),undefined,t=>commonTimings.push(t),'interpret');}catch(e){commonError=e.message;}
 const arms=['baseline','cowriter'];if(randomInt(2))arms.reverse();
 const pair={id:task.id,mode:task.mode,text:task.text,arms:[]};
 for(const arm of arms){
  const timings=[],start=Date.now();let result,error;
  try{
   if(commonError)throw new Error(commonError);
   result=await writeDraft({input,image,intentOverride,apiKey:process.env.GEMINI_API_KEY,signal:AbortSignal.timeout(15000),onTiming:t=>timings.push(t),queryStrategy:arm==='baseline'?'literal':'relational',pictureStrategy:arm==='baseline'?'direct':'interpreted',retrieve:async(vectors,queries)=>{const r=await db.query('select private.cowriter_search($1,$2,$3) hits',[JSON.stringify(vectors),queries,INDEX_VERSION]);return r.rows[0].hits;}});
  }catch(e){error=e.message;}
  const elapsed=Date.now()-start;
  const label=pair.arms.length===0?'A':'B',images=[];
  if(result)for(const [index,option] of result.options.entries()){
   const file=`${task.id}-${label}-${index+1}.jpg`;
   const bytes=image??await readFile(path.join('public/catalog',result.pool.find(r=>r.id===option.image_id).storage_path));
   await writeFile(path.join(out,file),await sharp(await renderMeme(bytes,option.caption)).jpeg({quality:90}).toBuffer());images.push(file);
  }
  pair.arms.push({label,images,failed:!!error});key.push({id:task.id,label,arm});
  results.push({task_id:task.id,mode:task.mode,arm,input,result,error,elapsed_ms:elapsed,common_interpretation_timings:commonTimings,timings,model:MODEL,prompt_version:VERSION,prompt_sha256:promptHash,index_version:INDEX_VERSION,catalog_sha256:catalogHash});
  console.log(`${task.id} ${arm}: ${error??`${result.options.length} complete options in ${elapsed}ms`}`);
  await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
 }
 blind.push(pair);
}
 await writeFile(path.join(out,'blind-key.json'),JSON.stringify(key,null,2));
 await writeFile(path.join(out,'review.html'),reviewSheet(blind));
 console.log(`Review: ${path.resolve(out,'review.html')}. This development set is NOT evidence of human preference.`);
}finally{await db.close();}

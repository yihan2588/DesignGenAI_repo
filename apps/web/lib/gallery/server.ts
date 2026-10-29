import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createClient} from '@/lib/supabase/server';
import {context,readState,imageBytes} from '@/lib/cowriter/server';
import {captionSchema} from '@/lib/cowriter/contracts';
import {CowriterError} from '@/lib/cowriter/provider';
import type {z} from 'zod';
import type {publishInput} from './contracts';
type Client=Awaited<ReturnType<typeof createClient>>;
export type SharedImage={bucket:'catalog'|'funny-gallery';path:string;caption:string;alt:string;width:number;height:number};
export function databaseError(error:{message:string;code?:string}|null,fallback='This action could not be completed.'):never{
 const message=error?.message??fallback;
 const known=/^(Your draft|Take not found|Choose|You can share|This meme|Meme not found|Sign in|This is not|An admin|Tell us|The daily|Remix image|The public image)/.test(message);
 throw new CowriterError(known?message:fallback,error?.code==='42501'?403:error?.code==='54000'?429:error?.code==='40001'?409:400);
}
export async function sharedImage(client:Client,id:string):Promise<SharedImage>{
 const {data,error}=await client.rpc('funny_image',{p_id:id});
 if(error||!data)throw new CowriterError('Meme not found.',404);
 return data as SharedImage;
}
export async function sharedBytes(client:Client,media:SharedImage){
 if(media.bucket==='catalog'){
  if(!/^[a-f0-9]{64}\.jpg$/.test(media.path))throw new CowriterError('Image unavailable.',404);
  if(process.env.VERCEL_URL){const r=await fetch(`https://${process.env.VERCEL_URL}/catalog/${media.path}`,{redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)throw new CowriterError('Image unavailable.',404);return Buffer.from(await r.arrayBuffer());}
  return readFile(path.join(process.cwd(),'public/catalog',media.path));
 }
 if(media.bucket!=='funny-gallery'||!/^([a-f0-9-]{36})\/[a-f0-9-]{36}\.jpg$/.test(media.path))throw new CowriterError('Image unavailable.',404);
 const {data,error}=await client.storage.from('funny-gallery').download(media.path);
 if(error||!data)throw new CowriterError('This image is no longer available.',404);
 return Buffer.from(await data.arrayBuffer());
}
// Stable per draft revision, so retrying Share cannot create duplicate publication files.
export function publicationPath(owner:string,session:string,revision:number,option:string){
 const h=createHash('sha256').update(`${owner}:${session}:${revision}:${option}`).digest('hex');
 return `${owner}/${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}.jpg`;
}
export async function publish(request:Request,input:z.infer<typeof publishInput>){
 const {client,user,key}=await context(request);const state=await readState(client,input.sessionId);
 if(state.revision!==input.revision)throw new CowriterError('Your draft changed. Save or reload before sharing.',409);
 const option=state.options.find(o=>o.id===input.optionId);if(!option)throw new CowriterError('Take not found.',404);captionSchema.parse(option.caption);
 const image=await imageBytes(client,state,option.image_id);const filePath=publicationPath(user.id,state.id,state.revision,option.id);
 const upload=await client.storage.from('funny-gallery').upload(filePath,image,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
 // An existing object is the same immutable snapshot; no replacement permissions exist.
 if(upload.error && !/already exists|duplicate/i.test(upload.error.message))throw new CowriterError('The public image could not be prepared. Please try again.',502);
 const {data,error}=await client.rpc('funny_publish',{p_key:key,p_session:state.id,p_revision:state.revision,p_option:option.id,p_path:filePath,p_author:input.authorName});
 if(error||!data){if(!upload.error)await client.storage.from('funny-gallery').remove([filePath]);databaseError(error);}
 return data as {postId:string;status:string};
}
export async function remix(request:Request,id:string){
 const {client,user,key}=await context(request);const media=await sharedImage(client,id);const bytes=await sharedBytes(client,media);
 const filePath=`${user.id}/${randomUUID()}.jpg`;
 const {error:uploadError}=await client.storage.from('cowriter-uploads').upload(filePath,bytes,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
 if(uploadError)throw new CowriterError('The remix picture could not be saved. Your upload allowance may be full.',400);
 const {data,error}=await client.rpc('funny_remix',{p_key:key,p_post:id,p_upload_path:filePath});
 if(error||!data){await client.storage.from('cowriter-uploads').remove([filePath]);databaseError(error);}
 return {state:data};
}

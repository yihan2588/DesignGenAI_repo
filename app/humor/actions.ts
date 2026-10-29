"use server";
import {requireUser} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {isUuid,type Choice,type Poll} from '@/lib/humor/schemas';
export async function castVote(runId:string,choice?:Choice):Promise<{poll?:Poll;error?:string}>{
 await requireUser();if(choice)return {error:'Comparisons are archived. Create a meme in Funny Lab.'};
 if(!isUuid(runId))return {error:'Comparison not found.'};
 const client=await createClient();const {data,error}=await client.rpc('humor_poll',{p_run:runId});
 return error?{error:'These archived results are unavailable.'}:{poll:data as Poll};
}
export async function uploadHumor(_form:FormData):Promise<{runId?:string;error?:string}>{void _form;return {error:'Comparisons are archived. Create a meme in Funny Lab.'};}
export async function retryHumor(_id:string):Promise<{runId?:string;error?:string}>{void _id;return {error:'Comparisons are archived. Create a meme in Funny Lab.'};}

"use server";
import type {Caption} from '@/lib/caption-validation';
export type VoteState={error?:string;value?:1|-1};
export async function rateCaption(previous:VoteState,_form:FormData):Promise<VoteState>{void _form;return {...previous,error:'This earlier gallery is archived.'};}
export type GenerationState={error?:string;caption?:Caption};
export async function createDescription(_previous:GenerationState,_form:FormData):Promise<GenerationState>{void _previous;void _form;return {error:'Create a meme in Funny Lab.'};}

import {boundedBody,context,failure,json} from '@/lib/cowriter/server';
import {galleryAction} from '@/lib/gallery/contracts';
import {databaseError} from '@/lib/gallery/server';
export async function POST(request:Request){try{
 const {client}=await context(request);const p=galleryAction.parse(JSON.parse((await boundedBody(request)).toString()));
 const {data,error}=await client.rpc('funny_gallery_action',{p_id:p.id,p_action:p.action,p_value:p.value??null,p_reason:p.reason??null});if(error)databaseError(error);return json(data);
}catch(e){return failure(e);}}

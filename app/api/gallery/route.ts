import {createClient} from '@/lib/supabase/server';
import {failure,json} from '@/lib/cowriter/server';
import {galleryQuery} from '@/lib/gallery/contracts';
import {databaseError} from '@/lib/gallery/server';
export async function GET(request:Request){try{
 const p=galleryQuery.parse(Object.fromEntries(new URL(request.url).searchParams));const client=await createClient();
 const {data,error}=await client.rpc('funny_feed',{p_filter:p.filter,p_page:p.page,p_query:p.q,p_post:p.id??null});if(error)databaseError(error);return json(data);
}catch(e){return failure(e);}}

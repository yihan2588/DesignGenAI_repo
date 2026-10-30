import {createClient} from '@/lib/supabase/server';
import {CowriterError} from '@/lib/cowriter/provider';
import {failure} from '@/lib/cowriter/server';
import {postInput} from '@/lib/gallery/contracts';
import {sharedImage,sharedBytes} from '@/lib/gallery/server';
import {renderMeme} from '@/lib/cowriter/render';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const p=postInput.parse(Object.fromEntries(new URL(request.url).searchParams));const client=await createClient();const media=await sharedImage(client,p.id);
 const png=await renderMeme(await sharedBytes(client,media),media.caption);
 const {error}=await client.rpc('funny_record_download',{p_key:process.env.HUMOR_WRITER_KEY,p_post:p.id});
 if(error)throw new CowriterError('Download could not be recorded. Please try again.',503);
 return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="funnyllm-meme.png"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}

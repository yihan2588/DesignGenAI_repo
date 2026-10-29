import {createClient} from '@/lib/supabase/server';
import {failure} from '@/lib/cowriter/server';
import {postInput} from '@/lib/gallery/contracts';
import {sharedImage,sharedBytes} from '@/lib/gallery/server';
import {renderMeme} from '@/lib/cowriter/render';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const p=postInput.parse(Object.fromEntries(new URL(request.url).searchParams));const client=await createClient();const media=await sharedImage(client,p.id);
 return new Response(new Uint8Array(await renderMeme(await sharedBytes(client,media),media.caption)),{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="funnyllm-meme.png"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}

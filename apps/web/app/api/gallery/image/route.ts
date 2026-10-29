import {createClient} from '@/lib/supabase/server';
import {failure} from '@/lib/cowriter/server';
import {postInput} from '@/lib/gallery/contracts';
import {sharedImage,sharedBytes} from '@/lib/gallery/server';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const p=postInput.parse(Object.fromEntries(new URL(request.url).searchParams));const client=await createClient();const media=await sharedImage(client,p.id);
 return new Response(new Uint8Array(await sharedBytes(client,media)),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}

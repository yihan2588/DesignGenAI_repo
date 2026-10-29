import { context,readState,imageBytes,failure } from "@/lib/cowriter/server";
export async function GET(request:Request){try{
 const {client}=await context(request,false);const q=new URL(request.url).searchParams;
 const state=await readState(client,q.get("session")??"");const bytes=await imageBytes(client,state,q.get("image")??"");
 return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}catch(e){return failure(e);}}

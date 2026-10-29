import { context,json,readState,failure } from "@/lib/cowriter/server";
export async function GET(request:Request){try{
 const {client}=await context(request,false);const id=new URL(request.url).searchParams.get("id");
 if(id)return json({state:await readState(client,id)});
 const {data,error}=await client.rpc("cowriter_read");if(error)throw error;return json({drafts:data});
}catch(e){return failure(e);}}

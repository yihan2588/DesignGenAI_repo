import { z } from "zod";
import { context,readState,imageBytes,boundedBody,failure } from "@/lib/cowriter/server";
import { CowriterError } from "@/lib/cowriter/provider";
import { renderMeme } from "@/lib/cowriter/render";
export const runtime="nodejs";
export async function POST(request:Request){try{
 const {client}=await context(request);
 const body=z.object({sessionId:z.uuid(),optionId:z.uuid(),revision:z.number().int()}).parse(JSON.parse((await boundedBody(request)).toString()));
 const state=await readState(client,body.sessionId);
 if(state.revision!==body.revision)throw new CowriterError("This draft changed. Reload it before downloading.",409);
 const option=state.options.find(o=>o.id===body.optionId);if(!option)throw new CowriterError("Option not found.",404);
 const png=await renderMeme(await imageBytes(client,state,option.image_id),option.caption);
 await client.rpc("cowriter_feedback",{p_session:state.id,p_revision:state.revision,p_option:option.id,p_reason:"export"});
 return new Response(new Uint8Array(png),{headers:{"Content-Type":"image/png","Content-Disposition":'attachment; filename="funnyllm-meme.png"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}catch(e){return failure(e);}}

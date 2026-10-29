import { z } from "zod";
import { context,json,boundedBody,failure } from "@/lib/cowriter/server";
export async function POST(request:Request){try{
 const {client}=await context(request);const b=z.object({sessionId:z.uuid(),revision:z.number().int(),optionId:z.uuid(),reason:z.enum(['keep','export','too_literal','wordy','familiar','no_connection'])}).parse(JSON.parse((await boundedBody(request)).toString()));
 const {error}=await client.rpc("cowriter_feedback",{p_session:b.sessionId,p_revision:b.revision,p_option:b.optionId,p_reason:b.reason});if(error)throw error;return json({ok:true});
}catch(e){return failure(e);}}

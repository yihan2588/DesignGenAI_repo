import { editSchema } from "@/lib/cowriter/contracts";
import { runAction,boundedBody,failure } from "@/lib/cowriter/server";
export const runtime="nodejs";export const maxDuration=30;
export async function POST(request:Request){try{return await runAction(request,editSchema.parse(JSON.parse((await boundedBody(request)).toString())));}catch(e){return failure(e);}}

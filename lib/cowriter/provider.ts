import { z } from "zod";
import { MODEL, EMBEDDING_MODEL, normalizeVector } from "./contracts.ts";

export type Timing = { stage: string; elapsed_ms: number; usage?: unknown; outcome: string };
export class CowriterError extends Error { readonly status: number; constructor(message: string, status = 502) { super(message); this.status=status; } }
export async function generate<T>(prompt: string, schema: z.ZodType<T>, key: string, signal: AbortSignal, image?: Buffer,
  onTiming?: (timing: Timing) => void, stage = "compose", request: typeof fetch = fetch): Promise<T> {
  const start = Date.now();
  try {
    const response = await request("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method:"POST", signal, headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({model:MODEL,store:false, input:[{type:"text",text:prompt}, ...(image ? [{type:"image",data:image.toString("base64"),mime_type:"image/jpeg"}] : [])],
        generation_config:{max_output_tokens:1600,temperature:1}, response_format:{type:"text",mime_type:"application/json",schema:z.toJSONSchema(schema,{unrepresentable:"any"})}}),
    });
    if (!response.ok) throw new CowriterError(response.status === 429 ? "The writer is busy. Please try again shortly." : "The writer could not finish. Please try again.",response.status===429?429:502);
    const data = await response.json();
    const raw = data.output_text ?? data.steps?.filter((s:{type:string})=>s.type==="model_output").flatMap((s:{content:unknown[]})=>s.content??[])
      .filter((p:{type:string})=>p.type==="text").map((p:{text:string})=>p.text??"").join("");
    const result = schema.parse(JSON.parse(raw ?? ""));
    onTiming?.({stage,elapsed_ms:Date.now()-start,usage:data.usage,outcome:"ok"}); return result;
  } catch (e) {
    onTiming?.({stage,elapsed_ms:Date.now()-start,outcome:signal.aborted?"timeout":"error"});
    if (signal.aborted) throw new CowriterError("This took too long. Your last results are safe; try again.",504);
    if (e instanceof CowriterError) throw e;
    throw new CowriterError("The writer returned an incomplete result. Please try again.");
  }
}
export async function embed(texts: string[], key: string, signal: AbortSignal, task = "RETRIEVAL_QUERY", request: typeof fetch = fetch) {
  const response = await request(`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`, {
    method:"POST",signal,headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({requests:texts.map(text=>({model:`models/${EMBEDDING_MODEL}`,content:{parts:[{text}]},taskType:task,outputDimensionality:768}))}),
  });
  if(!response.ok) throw new CowriterError("Image search is busy. Please try again.",503);
  const body=await response.json();
  if(body.embeddings?.length!==texts.length) throw new CowriterError("Image search is temporarily unavailable.",503);
  return body.embeddings.map((e:{values:number[]})=>normalizeVector(e.values)) as number[][];
}

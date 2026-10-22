import sharp from "sharp";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-origin";
import { generateConfiguredPair, type PromptConfig } from "@/lib/humor/configured";
import { isUuid } from "@/lib/humor/schemas";
export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (data: object, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== requestOrigin(request.headers)) return reply({ error: "Invalid request origin." }, 403);
  const user = await getUser(); if (!user) return reply({ error: "Sign in to generate captions." }, 401);
  const { id } = await params; if (!isUuid(id)) return reply({ error: "Comparison not found." }, 404);
  const client = await createClient();
  const { data: run } = await client.from("humor_runs").select("id,status,humor_images(storage_path)").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!run) return reply({ error: "Comparison not found." }, 404);
  if (run.status === "ready") return reply({ status: "ready", runId: id });
  const key = process.env.HUMOR_WRITER_KEY; const apiKey = process.env.GEMINI_API_KEY;
  if (!key || !apiKey) return reply({ error: "Caption generation is temporarily unavailable. Please try again later." }, 503);
  const { data: claim, error: claimError } = await client.rpc("humor_experiment_claim", { p_run: id, p_key: key });
  if (claimError) return reply({ error: claimError.message.startsWith("The demo has reached") ? claimError.message : "Generation could not be started. Please try again." }, 429);
  if (!claim) return reply({ status: run.status, runId: id }, 202);
  const { token, first, second } = claim as {token:string;first:PromptConfig;second:PromptConfig};
  try {
    const image = run.humor_images as unknown as { storage_path: string };
    const { data, error } = await client.storage.from("humor-images").download(image.storage_path);
    if (error || !data) throw new Error("Your saved image could not be loaded. Please retry.");
    const bytes = await sharp(Buffer.from(await data.arrayBuffer())).resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const result = await generateConfiguredPair(bytes, apiKey, first, second, { onStep: async step => {
      const { error } = await client.rpc("humor_record_step", { p_run: id, p_token: token, p_key: key, p_step: step });
      if (error) throw new Error("Generation progress could not be saved.");
    } });
    const { error: finishError } = await client.rpc("humor_finish", { p_run: id, p_token: token, p_key: key, p_result: result });
    if (finishError) throw new Error("Your captions could not be saved. Please retry.");
    return reply({ status: "ready", runId: id });
  } catch (error) {
    const message = error instanceof Error && /^(Gemini|Caption generation|Your |Generation progress)/.test(error.message) ? error.message : "Caption generation was interrupted. Please retry.";
    await client.rpc("humor_finish", { p_run: id, p_token: token, p_key: key, p_result: null, p_error: message });
    return reply({ status: "failed", error: message, runId: id }, 502);
  }
}

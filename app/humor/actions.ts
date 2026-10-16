"use server";
import { randomUUID } from "node:crypto";
import { requireUser, requireCompleteProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { prepareGalleryImage } from "@/lib/gallery-image";
import { isUuid, type Choice, type Poll } from "@/lib/humor/schemas";
import { revalidatePath } from "next/cache";
export async function castVote(runId: string, choice?: Choice): Promise<{ poll?: Poll; error?: string }> {
  await requireUser();
  if (!isUuid(runId) || (choice !== undefined && choice !== "A" && choice !== "B")) return { error: "Choose one of the two captions." };
  const client = await createClient();
  const { data, error } = choice
    ? await client.rpc("humor_vote", { p_run: runId, p_choice: choice })
    : await client.rpc("humor_poll", { p_run: runId });
  if (error) return { error: choice ? "Your vote could not be saved. Please try again." : "Results are available after your vote is saved. Please refresh." };
  revalidatePath(`/runs/${runId}`);
  return { poll: data as Poll };
}
export async function uploadHumor(form: FormData): Promise<{ runId?: string; error?: string }> {
  const { user } = await requireCompleteProfile();
  const title = String(form.get("title") ?? "").trim(); const alt = String(form.get("alt_text") ?? "").trim();
  const key = form.get("request_key"); const file = form.get("photo");
  if (!title || title.length > 100 || !alt || alt.length > 300 || form.get("public_ack") !== "on" || !isUuid(key)) return { error: "Add a title, describe the image, and confirm that your upload will be public." };
  if (!(file instanceof File)) return { error: "Choose an image." };
  const client = await createClient();
  const { data: existing } = await client.from("humor_runs").select("id").eq("owner_id", user.id).eq("request_key", key).maybeSingle();
  if (existing) return { runId: existing.id };
  let bytes: Buffer;
  try { bytes = await prepareGalleryImage(file, 2 * 1024 * 1024); }
  catch (e) { return { error: e instanceof Error ? e.message : "This image could not be read." }; }
  const path = `${user.id}/${key}.jpg`;
  const { error: uploadError } = await client.storage.from("humor-images").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploadError) return { error: "The image could not be uploaded. Please try again." };
  const { data, error } = await client.rpc("humor_create_upload", { p_path: path, p_title: title, p_alt: alt, p_request: key });
  if (error || !data) {
    await client.storage.from("humor-images").remove([path]);
    const message = error?.message ?? "";
    return { error: /^(Wait 30 seconds|You have reached|Complete your profile)/.test(message) ? message : "The comparison could not be saved. Please try again." };
  }
  revalidatePath("/members"); return { runId: data as string };
}
export async function retryHumor(runId: string): Promise<{ runId?: string; error?: string }> {
  await requireCompleteProfile();
  if (!isUuid(runId)) return { error: "Comparison not found." };
  const client = await createClient();
  const { data, error } = await client.rpc("humor_retry", { p_run: runId, p_request: randomUUID() });
  if (error) return { error: /^(Wait 30 seconds|You have reached|This comparison)/.test(error.message) ? error.message : "This comparison cannot be retried yet. Please refresh." };
  return { runId: data as string };
}

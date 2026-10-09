"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CAPTION_PROMPT, validateVote, type Caption } from "@/lib/caption-validation";
import { generateCaption, GEMINI_MODEL } from "@/lib/gemini";
import sharp from "sharp";

export type VoteState = { error?: string; value?: 1 | -1 };
export async function rateCaption(previous: VoteState, form: FormData): Promise<VoteState> {
  const user = await requireUser();
  const vote = validateVote(form);
  if (!vote) return { value: previous.value, error: "Choose an upvote or downvote for this description." };
  const supabase = await createClient();
  // The first vote creates a row; later changes update only this user's rating.
  const { error } = await supabase.from("caption_votes").insert(vote);
  if (error?.code === "23505") {
    const updated = await supabase.from("caption_votes").update({ value: vote.value })
      .eq("caption_id", vote.caption_id).eq("user_id", user.id).select("value").single();
    if (updated.error) return { value: previous.value, error: "Your vote could not be saved. Please try again." };
  } else if (error) return { value: previous.value, error: "Your vote could not be saved. Please try again." };
  revalidatePath("/");
  return { value: vote.value };
}

export type GenerationState = { error?: string; caption?: Caption };
export async function createDescription(_previous: GenerationState, form: FormData): Promise<GenerationState> {
  await requireUser();
  const rawId = form.get("photo_id");
  if (typeof rawId !== "string" || !/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) return { error: "Choose a photo from the gallery." };
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "AI descriptions are temporarily unavailable. Please try again later." };
  const supabase = await createClient();
  const { data: photo, error: photoError } = await supabase.from("food_photos").select("id,storage_path").eq("id", Number(rawId)).single();
  if (photoError || !photo) return { error: "This photo is no longer available." };
  const { data: reservation, error: limitError } = await supabase.from("caption_generation_requests")
    .insert({ photo_id: photo.id, prompt: CAPTION_PROMPT }).select("id").single();
  if (limitError || !reservation) return { error: limitError?.code === "P0001" ? limitError.message : "This generation could not be started. Please try again." };
  try {
    const { data: image, error: imageError } = await supabase.storage.from("food-photos").download(photo.storage_path);
    if (imageError || !image || image.size > 2 * 1024 * 1024) return { error: "This photo could not be read. Please try another." };
    const bytes = await sharp(Buffer.from(await image.arrayBuffer()), { limitInputPixels: 20_000_000 })
      .rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const text = await generateCaption(bytes, CAPTION_PROMPT, key);
    const { data, error } = await supabase.from("food_captions").insert({
      ...text, photo_id: photo.id, generation_id: reservation.id, prompt: CAPTION_PROMPT, model: GEMINI_MODEL,
    }).select("id,photo_id,dish,region,model,created_at").single();
    if (error || !data) return { error: "The description could not be saved. Please try again later." };
    revalidatePath("/");
    return { caption: data as Caption };
  } catch (error) {
    // Provider bodies and transport errors can contain secrets; return only safe messages.
    if (error instanceof Error && ["The AI is busy right now. Please try again later.",
      "AI descriptions are temporarily unavailable. Please try again later.",
      "The AI could not finish this description. Please try again.",
      "The AI could not produce two short sentences. Please try again."].includes(error.message)) return { error: error.message };
    return { error: "The description could not be generated. Please try again later." };
  }
}

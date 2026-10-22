"use server";
import { requireAdmin } from "@/lib/admin";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCompleteProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_GALLERY_BYTES, validateGalleryFields } from "@/lib/gallery-validation";
import { prepareGalleryImage } from "@/lib/gallery-image";

export type UploadState = { error?: string; photoId?: number };

export async function uploadFoodPhoto(_previous: UploadState, form: FormData): Promise<UploadState> {
  await requireAdmin();
  const { user } = await requireCompleteProfile();
  const fields = validateGalleryFields(form);
  if (!fields) return { error: "Add a title and image description within the limits, and confirm that your photo will be public." };
  const photo = form.get("photo");
  if (!(photo instanceof File)) return { error: "Choose a photo to upload." };
  let bytes: Buffer;
  try {
    bytes = await prepareGalleryImage(photo, MAX_GALLERY_BYTES);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "This photo could not be read." };
  }
  const supabase = await createClient();
  const path = `${user.id}/${randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from("food-photos").upload(path, bytes, {
    contentType: "image/jpeg", upsert: false,
  });
  if (uploadError) return { error: "Your photo could not be uploaded. Please try again." };
  // Owner and display order come from database defaults, never form input.
  const { data, error } = await supabase.from("food_photos").insert({ ...fields, storage_path: path }).select("id").single();
  if (error || !data) {
    const { error: cleanupError } = await supabase.storage.from("food-photos").remove([path]);
    if (cleanupError) console.error("Unpublished food photo cleanup failed:", cleanupError.message);
    return { error: "Your photo could not be added to the gallery. Please try again." };
  }
  revalidatePath("/");
  return { photoId: data.id };
}

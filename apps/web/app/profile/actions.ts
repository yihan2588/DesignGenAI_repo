"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeReturn } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser, getProfile } from "@/lib/auth";
import { prepareAvatarImage } from "@/lib/avatar-image";
import { validateNames } from "@/lib/profile-validation";

export type ProfileState = { error?: string; success?: string };

export async function saveProfile(_previous: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const names = validateNames(formData.get("first_name"), formData.get("last_name"));
  if (!names) return { error: "Enter a first and last name, each up to 80 characters." };

  const supabase = await createClient();
  const current = await getProfile(user.id);
  const photo = formData.get("photo");
  let newPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    let bytes: Buffer;
    try { bytes = await prepareAvatarImage(photo); }
    catch (error) { return { error: error instanceof Error ? error.message : "Your photo could not be read." }; }
    newPath = `${user.id}/${randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(newPath, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) return { error: "Your photo could not be uploaded. Please try again." };
  }

  const { data, error } = await supabase.from("profiles").update({
    ...names, ...(newPath ? { avatar_path: newPath } : {}),
  }).eq("id", user.id).eq("updated_at", current.updated_at).select("id").maybeSingle();
  if (error || !data) {
    if (newPath) await supabase.storage.from("avatars").remove([newPath]);
    return { error: "Your profile could not be saved. Reload this page and try again." };
  }
  if (newPath && current.avatar_path) {
    const { error: cleanupError } = await supabase.storage.from("avatars").remove([current.avatar_path]);
    if (cleanupError) console.error("Old avatar cleanup failed:", cleanupError.message);
  }
  revalidatePath("/profile");
  revalidatePath("/creations");
  revalidatePath("/");
  if (formData.get("next")) redirect(safeReturn(formData.get("next")));
  return { success: "Your profile is saved." };
}

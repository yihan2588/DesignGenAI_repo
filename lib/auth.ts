import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isProfileComplete } from "@/lib/profile-validation";

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
  updated_at: string;
};

export const getUser = cache(async () => {
  const supabase = await createClient();
  // Ask Auth to validate the session, including server-side revocation.
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function getProfile(userId: string): Promise<Profile> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles")
    .select("id,first_name,last_name,avatar_path,updated_at").eq("id", userId).single();
  if (error || !data) throw new Error("Your profile could not be loaded. Please try again.");
  return data as Profile;
}

export async function requireCompleteProfile() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!isProfileComplete(profile)) redirect("/profile");
  return { user, profile };
}

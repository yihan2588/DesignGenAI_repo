"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-origin";
import { safeReturn } from "@/lib/humor/schemas";

export async function signInWithGoogle(form: FormData) {
  const requestHeaders = await headers();
  const origin = requestOrigin(requestHeaders);
  (await cookies()).set("humor_return",safeReturn(form.get("next")),{httpOnly:true,secure:origin.startsWith("https:"),sameSite:"lax",path:"/",maxAge:600});
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", origin).toString(), scopes: "openid email profile" },
  });
  if (error || !data.url) redirect("/login?error=unavailable");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) redirect("/profile?error=signout");
  redirect("/");
}

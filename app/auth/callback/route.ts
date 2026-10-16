import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProfileComplete } from "@/lib/profile-validation";
import { requestOrigin } from "@/lib/request-origin";
import { safeReturn } from "@/lib/humor/schemas";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = requestOrigin(request.headers);
  const supabase = await createClient();
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("first_name,last_name").eq("id", data.user.id).single();
      const next = safeReturn(request.cookies.get("humor_return")?.value);
      const destination = !profileError && profile && isProfileComplete(profile) ? next : `/profile?next=${encodeURIComponent(next)}`;
      const response = NextResponse.redirect(new URL(destination, origin));
      response.cookies.delete("humor_return");
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }
  const response = NextResponse.redirect(new URL("/login?error=callback", origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

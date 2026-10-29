import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-origin";
import { adminReturn } from "@/lib/admin-return";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = requestOrigin(request.headers);
  const supabase = await createClient();
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: allowed, error: denied } = await supabase.rpc("admin_access");
      const destination = !denied && allowed === true ? adminReturn(request.cookies.get("humor_return")?.value) : "/denied";
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

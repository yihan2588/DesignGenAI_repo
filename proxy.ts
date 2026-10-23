import { safeReturn } from "@/lib/humor/schemas";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse("Service unavailable",{status:503});
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const {data:{user}}=await supabase.auth.getUser();
  if(!["/login","/auth/callback","/denied"].includes(request.nextUrl.pathname)){
    if(!user)return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(safeReturn(request.nextUrl.pathname + request.nextUrl.search))}`,request.url));
    const {data,error}=await supabase.rpc("admin_access");
    if(error||data!==true)return NextResponse.redirect(new URL("/denied",request.url));
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"]};

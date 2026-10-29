import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { signInWithGoogle } from "@/app/auth/actions";
import { safeReturn } from "@/lib/humor/schemas";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams, destination = safeReturn(next); if (await getUser()) redirect(destination);
  return <div className="cw-app"><SiteHeader/><main id="main-content" className="funny-account-page"><h1>Your sense of humor belongs here.</h1><p>Make memes, keep your favorites, and share a good take.</p><section className="funny-account-panel" aria-label="Sign in"><h2>Continue with Google</h2><p>Any Google account is welcome. Your drafts start private.</p>{error && <p className="funny-inline-error" role="alert">Sign-in could not be completed. Please try again.</p>}<form action={signInWithGoogle}><input type="hidden" name="next" value={destination}/><button className="cw-primary">Sign in with Google</button></form></section></main><SiteFooter/></div>;
}

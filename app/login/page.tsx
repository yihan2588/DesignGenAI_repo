import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { SiteHeader } from "@/app/site-header";
import { signInWithGoogle } from "@/app/auth/actions";
import { safeReturn } from "@/lib/humor/schemas";
export const dynamic="force-dynamic";
export default async function Login({searchParams}:{searchParams:Promise<{error?:string;next?:string}>}) {
  const {error,next}=await searchParams; const destination=safeReturn(next); if(await getUser()) redirect(destination);
  return <div className="site-shell humor-shell"><SiteHeader/><main id="main-content" className="account-main"><p className="eyebrow">YOUR TAKE MATTERS</p><h1 className="account-title">Join the<br/><em>conversation.</em></h1><p className="account-copy">Sign in to pick your favorite captions, reveal the polls, and turn your own images into comparisons.</p><div className="account-card"><h2>One account. Your own point of view.</h2>{error&&<p className="form-message" role="alert">Sign-in could not be completed. Please try again.</p>}<form action={signInWithGoogle}><input type="hidden" name="next" value={destination}/><button className="primary-button">Continue with Google ↗</button></form><p className="fine-print">Your individual votes stay private. Only poll totals are shared.</p></div></main></div>;
}

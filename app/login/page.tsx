import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { SiteHeader } from "@/app/site-header";
import { signInWithGoogle } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getUser()) redirect("/members");
  const { error } = await searchParams;
  return <div className="site-shell"><SiteHeader /><main id="main-content" className="account-main">
    <p className="eyebrow">A SEAT AT THE TABLE</p>
    <h1 className="account-title">Welcome<br /><em>to the table.</em></h1>
    <p className="account-copy">Sign in to make this little food journal feel like yours. Set up your profile and visit your member space.</p>
    <div className="account-card">
      <h2>Come on in</h2>
      <p>Use your Google account to sign up or sign in.</p>
      {error && <p className="form-message" role="alert">{error === "callback" ? "Sign-in could not be completed. Please start again in this browser." : "Google sign-in is temporarily unavailable. Please try again."}</p>}
      <form action={signInWithGoogle}><button className="primary-button">Continue with Google <span aria-hidden="true">↗</span></button></form>
      <p className="fine-print">We use your Google account to sign you in. You choose the name and photo on your profile.</p>
    </div>
  </main></div>;
}

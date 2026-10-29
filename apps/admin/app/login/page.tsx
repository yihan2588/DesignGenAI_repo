import Link from "next/link";
import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/auth/actions";
import { getUser } from "@/lib/auth";
import { adminReturn } from "@/lib/admin-return";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams, destination = adminReturn(next);
  if (await getUser()) redirect(destination);
  return <main className="admin-login" id="main-content"><Link className="brand" href="/admin">FunnyLLM<span>Admin</span></Link><h1>Keep the funny flowing.</h1><p>Curate the gallery. Look inside the lab. Help the next joke land.</p>{error && <p className="error-message" role="alert">Sign-in could not finish. Please try again.</p>}<form action={signInWithGoogle}><input type="hidden" name="next" value={destination} /><button className="button primary">Continue with Google</button></form><p className="muted">For the three approved admin accounts.</p><a href="https://funnyllm.vercel.app">Looking for the gallery?</a></main>;
}

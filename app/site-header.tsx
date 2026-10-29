import Link from "next/link";
import { getUser } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
export async function SiteHeader() {
  const user = await getUser();
  return <header className="site-header"><Link className="wordmark" href="/" aria-label="HumorLLM home">HumorLLM<span>.</span></Link><nav className="site-nav" aria-label="Main navigation"><Link href="/">Co-writer</Link><Link href="/compare">Compare</Link><Link href="/upload" prefetch={false}>Upload</Link>{user ? <><Link href="/members" prefetch={false}>My runs</Link><Link href="/profile" prefetch={false}>Profile</Link><form action={signOut}><button className="text-button">Sign out</button></form></> : <Link href="/login" prefetch={false}>Sign in</Link>}</nav></header>;
}
export function SiteFooter() { return <footer className="site-footer"><span>HUMORLLM © {new Date().getFullYear()}</span><span>A SMALL STUDY IN GOOD TIMING</span><Link href="/privacy">Privacy & how it works</Link></footer>; }

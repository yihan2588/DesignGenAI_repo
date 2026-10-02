import Link from "next/link";
import { getUser } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";

export async function SiteHeader() {
  const user = await getUser();
  return <header className="site-header">
    <Link className="wordmark" href="/" aria-label="At the table, home">at the table<span>.</span></Link>
    <nav className="site-nav" aria-label="Main navigation">
      <Link href="/">Gallery</Link>
      {user ? <>
        <Link href="/members" prefetch={false}>My table</Link>
        <Link href="/profile" prefetch={false}>Profile</Link>
        <form action={signOut}><button className="text-button">Sign out</button></form>
      </> : <Link href="/login" prefetch={false}>Sign in</Link>}
    </nav>
  </header>;
}

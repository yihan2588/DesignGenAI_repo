import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "@/app/auth/actions";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireAdmin();
  return (
    <div className="control-room">
      <aside>
        <Link className="brand" href="/admin">
          <span className="brand-mark">h.</span>humorllm{" "}
          <small>CONTROL ROOM</small>
        </Link>
        <nav>
          <Link href="/admin">◉ Overview</Link>
          <Link href="/admin/media">▧ Media library</Link>
          <Link href="/admin/prompts">✳ Prompt lab</Link>
          <Link href="/admin/people">♙ People & votes</Link>
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" /> Superadmin
          <br />
          <small>{user.email}</small>
          <form action={signOut}>
            <button className="subtle">Sign out ↗</button>
          </form>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}

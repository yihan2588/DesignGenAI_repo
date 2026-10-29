import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "@/app/auth/actions";
import { AdminNavigation } from "./components/navigation";
import { appOrigin } from "@/lib/funny/data";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return <div className="admin-shell"><header className="admin-header"><Link className="brand" href="/admin">FunnyLLM<span>Admin</span></Link><div className="account-menu"><a href={appOrigin} target="_blank" rel="noreferrer">Open gallery</a><details><summary>Account</summary><p>{user.email}</p><form action={signOut}><button className="button">Sign out</button></form></details></div></header><AdminNavigation /><main id="main-content" className="admin-main">{children}</main><footer className="admin-footer">A little order. A lot of funny.</footer></div>;
}

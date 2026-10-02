import Link from "next/link";
import { requireCompleteProfile } from "@/lib/auth";
import { SiteHeader } from "@/app/site-header";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const { profile } = await requireCompleteProfile();
  return <div className="site-shell"><SiteHeader /><main id="main-content" className="account-main">
    <p className="eyebrow">MY TABLE / MEMBERS</p>
    <h1 className="account-title">A seat for<br /><em>{profile.first_name}.</em></h1>
    <p className="account-copy">Welcome back. This is your quiet corner of the journal, a little space for the meals and memories you will make next.</p>
    <section className="account-card"><h2>The next good memory</h2><p>Try a place you have been meaning to visit, cook something familiar, or share a meal with someone you miss. A good table is always worth making time for.</p><Link className="member-link" href="/">Explore the photo collection →</Link></section>
    <Link className="member-link" href="/profile">Edit your profile →</Link>
  </main></div>;
}

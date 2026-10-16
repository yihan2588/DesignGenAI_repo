import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { getUser } from "@/lib/auth";
import { getFeed, getPolls } from "@/lib/humor/data";
import { ComparisonCard } from "@/app/humor/comparison-card";
export const dynamic = "force-dynamic";
export default async function Home({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const params = await searchParams; const filter = ["examples", "community"].includes(params.filter ?? "") ? params.filter! : "all";
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  const [user, feed] = await Promise.all([getUser(), getFeed(filter, page)]);
  const polls = await getPolls(feed.runs.map(r => r.id), user?.id);
  return <div className="site-shell humor-shell"><SiteHeader /><main id="main-content">
    <section className="humor-hero"><p className="eyebrow">A LITTLE EXPERIMENT IN WHAT LANDS</p><div className="hero-layout"><h1>One image.<br />Two captions.<br /><em>Your call.</em></h1><div className="hero-aside"><span className="hero-symbol" aria-hidden="true">“ ”</span><p>Which one lands better?<br />Pick your favorite, then see how everyone voted.</p><Link className="primary-button" href="/upload">Upload an image <span aria-hidden="true">↗</span></Link><p className="fine-print">Two AI approaches. One honest first impression.</p></div></div></section>
    <section className="comparison-feed" aria-label="Caption comparisons"><div className="feed-toolbar"><nav className="feed-tabs" aria-label="Filter comparisons">{[["all","All runs"],["examples","Examples"],["community","Community"]].map(([key,label]) => <Link key={key} href={key === "all" ? "/" : `/?filter=${key}`} aria-current={filter === key ? "page" : undefined}>{label}</Link>)}</nav><span className="feed-note">CHOOSE FIRST. POLL SECOND.</span></div>
      {feed.runs.length ? feed.runs.map((run,index) => <ComparisonCard key={run.id} run={run} signedIn={Boolean(user)} poll={polls.get(run.id)} priority={index===0} />) : <div className="empty-state"><h2>{filter === "community" ? "The next good caption starts with you." : "A fresh page for a good laugh."}</h2><p>Upload an image to make the first comparison.</p><Link className="primary-button" href="/upload">Create a comparison ↗</Link></div>}
      <nav className="pagination" aria-label="Comparison pages">{page>1 && <Link href={`/?filter=${filter}&page=${page-1}`}>← Newer runs</Link>}{feed.more && <Link href={`/?filter=${filter}&page=${page+1}`}>More comparisons →</Link>}</nav>
    </section>
  </main><SiteFooter /></div>;
}

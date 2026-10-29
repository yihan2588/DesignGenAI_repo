import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { getUser } from "@/lib/auth";
import { getFeed, getPolls } from "@/lib/humor/data";
import { ComparisonCard } from "@/app/humor/comparison-card";
import { pageNumber } from "@/app/gallery/feed-data";
export const dynamic = "force-dynamic";
export const metadata = { title: "Comparison archive — FunnyLLM" };
export default async function Archive({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageNumber((await searchParams).page), [user,feed] = await Promise.all([getUser(),getFeed("all",page)]), polls = await getPolls(feed.runs.map(r => r.id),user?.id);
  return <div className="cw-app"><SiteHeader/><main id="main-content"><section className="funny-page-intro"><div><h1>Comparison archive</h1><p>Earlier caption experiments, preserved as a read-only record.</p></div><Link className="cw-secondary" href="/lab">Open Funny Lab</Link></section>{feed.runs.length ? feed.runs.map((run,index) => <ComparisonCard key={run.id} run={run} signedIn={!!user} poll={polls.get(run.id)} priority={index === 0}/>) : <section className="funny-empty"><h2>No archived comparisons here.</h2><p>Today’s creations live in the gallery.</p><Link className="cw-secondary" href="/">View the gallery</Link></section>}<nav className="funny-pagination" aria-label="Archive pages">{page > 1 && <Link href={`/compare?page=${page-1}`} className="cw-secondary">Previous page</Link>}{feed.more && <Link href={`/compare?page=${page+1}`} className="cw-secondary">Next page</Link>}</nav></main><SiteFooter/></div>;
}

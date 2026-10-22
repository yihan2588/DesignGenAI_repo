import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { getFeed } from "@/lib/humor/data";
export const dynamic = "force-dynamic";
export default async function Members({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user=await requireUser(); const params=await searchParams; const page=Math.max(1,Math.min(10000,parseInt(params.page??"1",10)||1));
  const feed=await getFeed("all",page,user.id);
  return <div className="site-shell humor-shell"><SiteHeader /><main id="main-content" className="account-main"><p className="eyebrow">YOUR EXPERIMENTS</p><h1 className="account-title">My <em>runs.</em></h1><p className="account-copy">Every image, every attempt. Your completed comparisons are in the community gallery.</p><Link className="primary-button" href="/upload">New comparison ↗</Link><div className="run-history">{feed.runs.length ? feed.runs.map(run=><Link className="history-row" key={run.id} href={`/runs/${run.id}`}><div><h2>{run.humor_images.title}</h2><span>{new Date(run.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"America/New_York"})}</span></div><span className={`status-pill status-${run.status}`}>{run.status === "ready" ? "Ready to compare" : run.status === "failed" ? "Retry available" : run.status === "pending" ? "Ready to generate" : "Writing captions"} ↗</span></Link>) : <p className="empty-state">Your first comparison is one image away.</p>}</div><nav className="pagination" aria-label="My runs pages">{page>1&&<Link href={`/members?page=${page-1}`}>← Newer</Link>}{feed.more&&<Link href={`/members?page=${page+1}`}>Older runs →</Link>}</nav></main><SiteFooter /></div>;
}

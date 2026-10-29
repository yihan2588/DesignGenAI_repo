import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { getUser } from "@/lib/auth";
import { getRun, getPolls } from "@/lib/humor/data";
import { isUuid } from "@/lib/humor/schemas";
import { ComparisonCard } from "@/app/humor/comparison-card";
export const dynamic = "force-dynamic";
export default async function RunPage({ params }: { params: Promise<{ id:string }> }) {
  const { id } = await params; if (!isUuid(id)) notFound();
  const [run,user] = await Promise.all([getRun(id),getUser()]); if (!run) notFound(); const polls = await getPolls([id],user?.id);
  return <div className="cw-app"><SiteHeader/><main id="main-content"><section className="funny-page-intro"><div><h1>Archived comparison</h1><p>New creation and editing now happen in Funny Lab.</p></div><Link className="cw-secondary" href="/compare">Back to archive</Link></section>{run.status === "ready" ? <ComparisonCard run={run} signedIn={!!user} poll={polls.get(id)} priority/> : <section className="funny-empty"><h2>{run.humor_images.title}</h2><p>This earlier attempt did not produce a completed comparison. The archive is read-only.</p><Link className="cw-secondary" href="/lab">Create a new meme</Link></section>}</main><SiteFooter/></div>;
}

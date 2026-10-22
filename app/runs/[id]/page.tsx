import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { getUser } from "@/lib/auth";
import { getRun, getPolls } from "@/lib/humor/data";
import { isUuid } from "@/lib/humor/schemas";
import { ComparisonCard } from "@/app/humor/comparison-card";
import { RunProgress } from "@/app/humor/run-progress";
export const dynamic = "force-dynamic";
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!isUuid(id)) notFound();
  const [run,user] = await Promise.all([getRun(id),getUser()]); if (!run) notFound();
  const polls = await getPolls([id],user?.id);
  // This dynamic server page evaluates the persisted lease once per incoming request.
  // eslint-disable-next-line react-hooks/purity
  const expired = run.status === "generating" && run.deadline_at !== null && new Date(run.deadline_at).getTime() + 15000 < Date.now();
  return <div className="site-shell humor-shell"><SiteHeader /><main id="main-content" className="run-main"><Link className="back-link" href="/">← All comparisons</Link>{run.status === "ready" ? <ComparisonCard run={run} signedIn={Boolean(user)} poll={polls.get(id)} priority /> : <><h1 className="run-title">{run.humor_images.title}</h1><RunProgress id={id} status={run.status} expired={expired} message={run.error_message} /></>}</main><SiteFooter /></div>;
}

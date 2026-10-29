import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { galleryFeed, pageNumber } from "@/app/gallery/feed-data";
import { GalleryFeed } from "@/app/gallery/feed";
import type { GalleryResult } from "@/app/gallery/types";
export const dynamic = "force-dynamic";
export const metadata = { title: "My creations — FunnyLLM" };
type Draft = { id: string; input: { mode: string; text: string }; updated_at: string; revision: number };
export default async function Creations({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  await requireUser("/creations");
  const params = await searchParams, tab = params.tab === "shared" || params.tab === "saved" ? params.tab : "drafts", page = pageNumber(params.page);
  let drafts: Draft[] = [], feed: GalleryResult | null = null, error = false;
  try { if (tab === "drafts") { const client = await createClient(); const result = await client.rpc("cowriter_read", { p_session: null, p_revision: null }); if (result.error) throw result.error; drafts = result.data ?? []; } else feed = await galleryFeed(tab === "shared" ? "mine" : "saved", page); } catch { error = true; }
  return <div className="cw-app"><SiteHeader active="creations"/><main id="main-content"><section className="funny-page-intro"><div><h1>My creations</h1><p>{tab === "drafts" ? "Your private work in progress, ready for another take." : tab === "shared" ? "The memes you’ve shared, with publishing controls." : "A collection of other people’s good timing."}</p></div><Link className="cw-primary" href="/lab">Make a meme</Link></section>
    <nav className="funny-tabs funny-creation-tabs" aria-label="Your collection">{[["drafts","Drafts"],["shared","Shared"],["saved","Saved"]].map(([key,label]) => <Link key={key} href={`/creations?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}</nav>
    {error ? <section className="funny-empty" role="alert"><h2>Your collection could not load.</h2><p>Try again to see your saved work.</p><Link className="cw-secondary" href={`/creations?tab=${tab}`}>Try again</Link></section> : tab === "drafts" ? drafts.length ? <><ul className="funny-draft-list">{drafts.map(d => <li key={d.id}><Link href={`/lab?mode=${d.input.mode === "thought" ? "thought" : "pic"}&draft=${d.id}`}><div><h2>{d.input.text || "A picture with a funny side"}</h2><p>{d.input.mode === "thought" ? "From a thought" : "From a picture"}</p></div><span>Edited {new Date(d.updated_at).toLocaleDateString("en-US", { month:"short", day:"numeric", timeZone:"America/New_York" })}</span></Link></li>)}</ul><p className="cw-hint">Your 30 most recently edited drafts. Drafts stay private until you share a take.</p></> : <section className="funny-empty"><h2>Your first take starts here.</h2><p>Start with a picture or a thought. Complete results save automatically.</p><Link className="cw-secondary" href="/lab">Open Funny Lab</Link></section> : feed && <GalleryFeed result={feed} signedIn page={page} base={`/creations?tab=${tab}`} emptyTitle={tab === "shared" ? "Nothing shared yet." : "Your collection has room."} emptyText={tab === "shared" ? "Share a finished take from Funny Lab when you’re ready." : "Save a meme in the gallery to find it here later."}/>}
    </main><SiteFooter/></div>;
}

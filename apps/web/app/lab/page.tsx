import { getUser } from "@/lib/auth";
import { Cowriter } from "@/app/cowriter/cowriter";
import { SiteHeader, SiteFooter } from "@/app/site-header";
import { isUuid } from "@/lib/navigation";
export const metadata = { title: "Funny Lab — FunnyLLM" };
export const dynamic = "force-dynamic";
export default async function Lab({ searchParams }: { searchParams: Promise<{ mode?: string; draft?: string }> }) {
  const [user, params] = await Promise.all([getUser(), searchParams]);
  return <div className="cw-app"><SiteHeader active="lab"/><main id="main-content"><Cowriter signedIn={!!user} initialMode={params.mode === "thought" ? "thought" : "pic"} initialDraft={isUuid(params.draft) ? params.draft : undefined}/></main><SiteFooter/></div>;
}

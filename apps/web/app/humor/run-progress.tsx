"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { retryHumor } from "./actions";
import { startGeneration } from "@/lib/humor/generation-client";
export { startGeneration } from "@/lib/humor/generation-client";
export function RunProgress({ id, status, expired, message }: { id: string; status: string; expired: boolean; message: string | null }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  useEffect(() => {
    if (status !== "generating" || expired) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/humor/runs/${id}`, {cache:"no-store", signal:controller.signal});
        if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
          setError("Sign in again to check your saved run."); return;
        }
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          setError(response.status === 404 ? "This comparison is no longer available." : "Sign in again to check your saved run.");
          return;
        }
        if (response.ok) {
          const run = await response.json();
          if (run.status === "ready" || run.status === "failed" || (run.deadline_at && Date.parse(run.deadline_at)+15000<Date.now())) {
            router.refresh(); return;
          }
        }
      } catch { if(controller.signal.aborted) return; }
      if (!controller.signal.aborted) timer=setTimeout(poll,3000);
    }
    timer=setTimeout(poll,2000);
    return () => {controller.abort(); clearTimeout(timer);};
  },[id,status,expired,router]);
  function run() { setError(""); start(async () => {
    let target = id;
    try {
      if (status === "failed" || expired) { const result = await retryHumor(id); if (!result.runId) throw new Error(result.error); target = result.runId; }
      await startGeneration(target); router.push(`/runs/${target}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Please retry."); if (target !== id) router.replace(`/runs/${target}`); router.refresh(); }
  }); }
  return <section className="account-card progress-card"><p className="eyebrow">{pending ? "WRITING CAPTIONS" : status === "failed" || expired ? "LET’S TRY THAT AGAIN" : "YOUR COMPARISON"}</p><h2>{pending ? "Two takes are on the way." : status === "pending" ? "Your image is ready." : status === "failed" || expired ? "This run didn’t finish." : "Captions are being written."}</h2>
    <p role="status">{pending ? "We’re generating both captions from the active prompt configurations. Your image is saved." : message ?? (expired ? "The previous request was interrupted. Your image is saved." : "Your image is safely saved. Both captions will appear together; this page checks progress automatically.")}</p>
    {error && <p role="alert" className="form-message">{error}</p>}
    {(status === "pending" || status === "failed" || expired) ? <button className="primary-button" disabled={pending} onClick={run}>{pending ? "Writing captions…" : status === "pending" ? "Generate both captions" : "Retry generation"}</button> : <button className="outline-button" onClick={() => router.refresh()}>Check progress</button>}
    <Link className="member-link" href="/members">All my runs →</Link>
  </section>;
}

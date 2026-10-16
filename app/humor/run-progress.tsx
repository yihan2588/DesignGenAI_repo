"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { retryHumor } from "./actions";
export async function startGeneration(id: string) {
  const response = await fetch(`/api/humor/runs/${id}/generate`, { method: "POST" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Caption generation failed. Please retry.");
  return result as { status: string; runId: string };
}
export function RunProgress({ id, status, expired, message }: { id: string; status: string; expired: boolean; message: string | null }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  function run() { setError(""); start(async () => {
    try {
      let target = id;
      if (status === "failed" || expired) { const result = await retryHumor(id); if (!result.runId) throw new Error(result.error); target = result.runId; }
      await startGeneration(target); router.push(`/runs/${target}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Please retry."); router.refresh(); }
  }); }
  return <section className="account-card progress-card"><p className="eyebrow">{pending ? "WRITING CAPTIONS" : status === "failed" || expired ? "LET’S TRY THAT AGAIN" : "YOUR COMPARISON"}</p><h2>{pending ? "Two takes are on the way." : status === "pending" ? "Your image is ready." : status === "failed" || expired ? "This run didn’t finish." : "Captions are being written."}</h2>
    <p role="status">{pending ? "We’re creating a simple caption and a second take from visual planning. You can keep this page open." : message ?? (expired ? "The previous request was interrupted. Your image is saved." : "Your image is safely saved. Both captions will appear together.")}</p>
    {error && <p role="alert" className="form-message">{error}</p>}
    {(status === "pending" || status === "failed" || expired) ? <button className="primary-button" disabled={pending} onClick={run}>{pending ? "Writing captions…" : status === "pending" ? "Generate both captions" : "Retry generation"}</button> : <button className="outline-button" onClick={() => router.refresh()}>Check progress</button>}
    <Link className="member-link" href="/members">All my runs →</Link>
  </section>;
}

"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { castVote } from "./actions";
import { captionMethod, type Choice, type Poll } from "@/lib/humor/schemas";
export function VotePanel({ runId, signedIn, poll, onPollChange }: { runId: string; signedIn: boolean; poll?: Poll; onPollChange: (poll: Poll) => void }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function submit(choice?: Choice) { setError(""); start(async () => {
    try { const result = await castVote(runId, choice); if (result.poll) onPollChange(result.poll); else setError(result.error ?? "Please try again."); }
    catch { setError("Your connection was interrupted. Please try again."); }
  }); }
  if (!signedIn) return <div className="vote-gate"><p>Your first instinct counts.</p><Link href={`/login?next=${encodeURIComponent(`/runs/${runId}`)}`} className="outline-button">Sign in to choose and reveal results <span aria-hidden="true">↗</span></Link></div>;
  return <div className="vote-panel" aria-label="Choose your preferred caption" aria-live="polite">
    {poll ? <section className="poll" aria-label="Public opinion">
      <div className="poll-heading"><h3>Public opinion</h3><span>You chose {poll.choice}</span></div>
      {(["A", "B"] as const).map(choice => { const count = choice === "A" ? poll.a : poll.b; const pct = poll.total ? Math.round(count / poll.total * 100) : 0;
        return <div className="poll-row" key={choice}><div className="poll-label"><strong>Version {choice}{poll.baseline_slot ? ` · ${captionMethod(choice, poll.baseline_slot)}` : ""}{choice === poll.choice ? " · your pick" : ""}</strong><span>{pct}% <small>({count})</small></span></div><div className="poll-track" aria-hidden="true"><div className={`poll-fill ${choice === poll.choice ? "chosen" : ""}`} style={{ width: `${pct}%` }} /></div></div>;
      })}
      <div className="poll-footer"><span>{poll.total} {poll.total === 1 ? "vote" : "votes"} · includes yours</span><button className="text-button" onClick={() => submit()} disabled={pending}>{pending ? "Refreshing…" : "Refresh results"}</button></div>
    </section> : <><div className="choose-buttons"><button className="choice-button" onClick={() => submit("A")} disabled={pending}>Choose A <span aria-hidden="true">↗</span></button><button className="choice-button" onClick={() => submit("B")} disabled={pending}>Choose B <span aria-hidden="true">↗</span></button></div><p className="vote-note" role="status">{pending ? "Saving your choice…" : "Choose once to reveal the poll and caption methods. Your vote is final for this comparison."}</p></>}
    {error && <p className="form-message" role="alert">{error}</p>}
  </div>;
}

"use client";

import { useActionState } from "react";
import { rateCaption, createDescription } from "@/app/caption-actions";
import type { Caption } from "@/lib/caption-validation";

function VoteForm({ captionId, title, initialVote }: { captionId: string; title: string; initialVote?: number }) {
  const [state, action, pending] = useActionState(rateCaption, { value: initialVote as 1 | -1 | undefined });
  const value = state.value;
  return <form action={action} className="caption-vote" aria-label={`Rate description for ${title}`}>
    <input type="hidden" name="caption_id" value={captionId} />
    <div className="vote-buttons">
      <button name="value" value="1" disabled={pending} aria-pressed={value === 1} aria-label={`Upvote description for ${title}`}><span aria-hidden="true">↑</span> Upvote</button>
      <button name="value" value="-1" disabled={pending} aria-pressed={value === -1} aria-label={`Downvote description for ${title}`}><span aria-hidden="true">↓</span> Downvote</button>
    </div>
    <p className="vote-status" role="status">{pending ? "Saving…" : value ? `Your vote: ${value === 1 ? "accurate" : "needs a second look"}` : ""}</p>
    {state.error && <p className="form-message" role="alert">{state.error}</p>}
  </form>;
}

export function CaptionControls({ caption, photoId, title, signedIn, initialVote }: {
  caption: Caption | null; photoId: number; title: string; signedIn: boolean; initialVote?: number;
}) {
  const [state, action, pending] = useActionState(createDescription, {});
  const current = state.caption && (!caption || state.caption.created_at >= caption.created_at) ? state.caption : caption;
  return <div className="ai-caption">
    {current ? <p className="ai-description">{current.dish} {current.region}</p> : <p className="caption-empty">A fresh dish, waiting for an AI description.</p>}
    {signedIn && <>
      {current && <VoteForm key={current.id} captionId={current.id} title={title} initialVote={current.id === caption?.id ? initialVote : undefined} />}
      <form action={action} className="generate-form" aria-label={`Generate description for ${title}`}>
        <input type="hidden" name="photo_id" value={photoId} />
        <button className="generate-button" disabled={pending}>{pending ? "Looking at the plate…" : current ? "New AI description ↻" : "Generate AI description ↗"}</button>
        {state.error && <p className="form-message" role="alert">{state.error}</p>}
      </form>
    </>}
  </div>;
}

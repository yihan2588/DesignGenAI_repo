"use client";
import { useState } from "react";
import Image from "next/image";
import { captionMethod, type Choice, type Poll } from "@/lib/humor/schemas";
import { VotePanel } from "./vote-panel";

export function ComparisonBody({ runId, imageSrc, alt, captions, signedIn, initialPoll, priority }: {
  runId: string; imageSrc: string; alt: string; captions: Record<Choice, string | null>;
  signedIn: boolean; initialPoll?: Poll; priority: boolean;
}) {
  // The server sends this mapping only after this account has a persisted vote.
  const [savedPoll, setSavedPoll] = useState(initialPoll);
  const poll = signedIn ? savedPoll : undefined;
  return <>
    <div className="caption-pair">{(["A", "B"] as const).map((slot, index) => <section key={slot} className={`caption-version ${poll?.choice === slot ? "is-selected" : ""}`} aria-label={`Version ${slot}`}>
      <div className="version-top"><div><span>VERSION {slot}</span>{poll?.baseline_slot && <span className="caption-method">{captionMethod(slot, poll.baseline_slot, poll.labels)}</span>}</div>{poll?.choice === slot && <span>YOUR PICK ✓</span>}</div>
      <a className="meme-frame" href={imageSrc} target="_blank" rel="noreferrer" aria-label={`View full image for version ${slot}`}><Image src={imageSrc} alt={alt} fill sizes="(max-width: 640px) 90vw, 500px" priority={priority && index === 0} className="meme-image" /></a>
      <p className="meme-caption">{captions[slot]}</p>
    </section>)}</div>
    <VotePanel runId={runId} signedIn={signedIn} poll={poll} onPollChange={setSavedPoll} />
  </>;
}

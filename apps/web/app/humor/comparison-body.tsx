import Image from "next/image";
import { captionMethod, type Choice, type Poll } from "@/lib/humor/schemas";
export function ComparisonBody({ imageSrc, alt, captions, signedIn, initialPoll, priority }: { runId: string; imageSrc: string; alt: string; captions: Record<Choice, string | null>; signedIn: boolean; initialPoll?: Poll; priority: boolean }) {
  const poll = signedIn ? initialPoll : undefined;
  return <><div className="funny-archive-pair">{(["A","B"] as const).map((slot,index) => <section key={slot} aria-label={`Archived caption ${slot}`}><h3>Caption {slot}</h3><Image src={imageSrc} alt={alt} width={960} height={720} priority={priority && index === 0} sizes="(max-width: 640px) 90vw, 500px"/><p className="funny-archive-caption">{captions[slot] || "No completed caption"}</p>{poll?.baseline_slot && <p className="cw-hint">{captionMethod(slot,poll.baseline_slot,poll.labels)}{poll.choice === slot ? ", your saved choice" : ""}</p>}</section>)}</div>{poll && <p className="cw-hint">Archived results: A received {poll.a} votes; B received {poll.b}. {poll.total} votes in total.</p>}</>;
}

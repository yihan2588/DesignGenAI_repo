import Image from "next/image";
import Link from "next/link";
import { imageUrl, type HumorRun } from "@/lib/humor/data";
import type { Poll } from "@/lib/humor/schemas";
import { VotePanel } from "./vote-panel";
export function ComparisonCard({ run, signedIn, poll, priority = false }: { run: HumorRun; signedIn: boolean; poll?: Poll; priority?: boolean }) {
  const photo = run.humor_images;
  return <article className="comparison-card" aria-labelledby={`title-${run.id}`}>
    <header className="comparison-heading"><div><span className="run-kind">{run.is_example ? "THE STARTER SET" : "FROM THE COMMUNITY"}</span><h2 id={`title-${run.id}`}><Link href={`/runs/${run.id}`}>{photo.title}</Link></h2></div><Link href={`/runs/${run.id}`} className="permalink" aria-label={`Open ${photo.title}`}>↗</Link></header>
    <div className="caption-pair">{(["A", "B"] as const).map((slot, index) => <section key={slot} className={`caption-version ${poll?.choice === slot ? "is-selected" : ""}`} aria-label={`Version ${slot}`}>
      <div className="version-top"><span>VERSION {slot}</span>{poll?.choice === slot && <span>YOUR PICK ✓</span>}</div>
      <a className="meme-frame" href={imageUrl(photo.storage_path)} target="_blank" rel="noreferrer" aria-label={`View full image for version ${slot}`}><Image src={imageUrl(photo.storage_path)} alt={photo.alt_text} fill sizes="(max-width: 640px) 90vw, 500px" priority={priority && index === 0} className="meme-image" /></a>
      <p className="meme-caption">{slot === "A" ? run.caption_a : run.caption_b}</p>
    </section>)}</div>
    <VotePanel key={run.id} runId={run.id} signedIn={signedIn} initialPoll={poll} />
    {photo.attribution && <p className="image-credit">{photo.attribution}</p>}
  </article>;
}

import { imageUrl, type HumorRun } from "@/lib/humor/data";
import type { Poll } from "@/lib/humor/schemas";
import { ComparisonBody } from "./comparison-body";
export function ComparisonCard({ run, signedIn, poll, priority = false }: { run: HumorRun; signedIn: boolean; poll?: Poll; priority?: boolean }) {
  const photo = run.humor_images;
  return <article className="comparison-card" aria-labelledby={`title-${run.id}`}>
    <header className="comparison-heading"><div><span className="run-kind">{run.is_example ? "THE STARTER SET" : "FROM THE COMMUNITY"}</span><h2 id={`title-${run.id}`}>{photo.title}</h2></div></header>
    <p className="image-description">{photo.alt_text}</p>
    <ComparisonBody key={`${run.id}-${signedIn}`} runId={run.id} imageSrc={imageUrl(photo.storage_path)} alt={photo.alt_text} captions={{ A: run.caption_a, B: run.caption_b }} signedIn={signedIn} initialPoll={poll} priority={priority} />
    {photo.attribution && <p className="image-credit">{photo.attribution}</p>}
  </article>;
}

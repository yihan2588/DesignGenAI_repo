import { imageUrl, type HumorRun } from "@/lib/humor/data";
import type { Poll } from "@/lib/humor/schemas";
import { ComparisonBody } from "./comparison-body";
export function ComparisonCard({ run, signedIn, poll, priority = false }: { run: HumorRun; signedIn: boolean; poll?: Poll; priority?: boolean }) {
  const photo = run.humor_images;
  return <article className="funny-archive-item" aria-labelledby={`title-${run.id}`}><h2 id={`title-${run.id}`}>{photo.title}</h2><p className="cw-hint">{run.is_example ? "Original example" : "Community comparison"}</p><ComparisonBody runId={run.id} imageSrc={imageUrl(photo.storage_path)} alt={photo.alt_text} captions={{ A:run.caption_a,B:run.caption_b }} signedIn={signedIn} initialPoll={poll} priority={priority}/>{photo.attribution && <p className="cw-hint">{photo.attribution}</p>}</article>;
}

import { handleCallback } from "@vercel/queue";
import { isUuid } from "@/lib/humor/schemas";
export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = handleCallback(async (message: { runId: string }) => {
  if (!isUuid(message.runId)) throw new Error("Invalid generation job.");
  const base = process.env.HUMOR_WORKER_INTERNAL_URL;
  const key = process.env.HUMOR_WORKER_KEY;
  if (!base || !key) throw new Error("Generation service is not configured.");
  const response = await fetch(new URL("/work", base), {
    method: "POST", headers: { "Content-Type": "application/json", "x-humor-worker-key": key },
    body: JSON.stringify({ run_id: message.runId }), signal: AbortSignal.timeout(285000),
  });
  if (!response.ok) throw new Error("Generation service will be retried.");
  const result = await response.json();
  if (!["ready", "failed"].includes(result.status)) throw new Error("Generation is not terminal.");
  console.log(JSON.stringify({ event: "humor_job_finished", runId: message.runId, status: result.status }));
}, { retry: (_error, metadata) => metadata.deliveryCount >= 8 ? { acknowledge: true } : { afterSeconds: 60 } });

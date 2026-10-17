import { send } from "@vercel/queue";
export async function publishGeneration(runId: string) {
  await send("humor-generation", { runId }, { idempotencyKey: runId, retentionSeconds: 900 });
}

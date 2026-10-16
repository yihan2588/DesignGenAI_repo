import { BASELINE_PROMPT, PLAN_PROMPT, candidatePrompt, MODEL, PROMPT_VERSION, CAPTION_SCHEMA, PLAN_SCHEMA, CANDIDATE_SCHEMA } from "./prompts.ts";
import { parseCaption, parsePlan, parseCandidates, normalizeCaption } from "./schemas.ts";

export type Step = { stage: string; prompt: string; output?: unknown; usage?: unknown; elapsed_ms: number; error?: string };
export async function generatePair(image: Buffer, apiKey: string, options: { request?: typeof fetch; onStep?: (step: Step) => Promise<void>; deadlineMs?: number } = {}) {
  const request = options.request ?? fetch; const start = Date.now();
  const deadline = start + (options.deadlineMs ?? 90000);
  let attempts = 0; const steps: Step[] = [];
  const controller = new AbortController();
  async function call<T>(stage: string, prompt: string, schema: object, parse: (v: unknown) => T): Promise<T> {
    const started = Date.now();
    if (++attempts > 4 || deadline - started < 1500) throw new Error("Caption generation reached its time limit. Please retry.");
    try {
      const response = await request("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, Math.min(45000, deadline - started)))]),
        body: JSON.stringify({ model: MODEL, store: false,
          input: [{ type: "text", text: prompt }, { type: "image", data: image.toString("base64"), mime_type: "image/jpeg" }],
          generation_config: { max_output_tokens: stage === "baseline" ? 384 : 1800, temperature: 1 },
          response_format: { type: "text", mime_type: "application/json", schema },
        }),
      });
      if (!response.ok) throw new Error(response.status === 429 || response.status >= 500 ? "Gemini is busy. Please retry in a moment." : "Gemini could not complete this request.");
      const result = await response.json() as { status?: string; steps?: { type: string; content?: { type: string; text?: string }[] }[]; usage?: unknown };
      if (result.status !== "completed") throw new Error("Gemini did not complete the caption.");
      const raw = result.steps?.filter(s => s.type === "model_output").flatMap(s => s.content ?? []).filter(p => p.type === "text").map(p => p.text ?? "").join("") ?? "";
      const output = JSON.parse(raw); const value = parse(output);
      const step = { stage, prompt, output, usage: result.usage, elapsed_ms: Date.now() - started };
      steps.push(step); await options.onStep?.(step); return value;
    } catch (error) {
      const message = error instanceof Error && /^(Gemini|Caption generation)/.test(error.message) ? error.message : "Gemini returned an incomplete or invalid response. Please retry.";
      const step = { stage, prompt, error: message, elapsed_ms: Date.now() - started }; steps.push(step); await options.onStep?.(step);
      throw new Error(message);
    }
  }
  async function bounded<T>(task: () => Promise<T>): Promise<T> {
    try { return await task(); } catch (error) { if (attempts < 4 && deadline - Date.now() > 5000) return task(); throw error; }
  }
  const baselineTask = bounded(() => call("baseline", BASELINE_PROMPT, CAPTION_SCHEMA, parseCaption));
  const guidedTask = (async () => {
    const plan = await bounded(() => call("planning", PLAN_PROMPT, PLAN_SCHEMA, parsePlan));
    const generated = await bounded(() => call("candidates", candidatePrompt(plan), CANDIDATE_SCHEMA, v => parseCandidates(v, plan)));
    return { plan, generated };
  })();
  const results = await Promise.allSettled([baselineTask, guidedTask]);
  const failed = results.find(r => r.status === "rejected");
  if (failed?.status === "rejected") { controller.abort(); throw failed.reason; }
  const baseline = (results[0] as PromiseFulfilledResult<string>).value;
  const guided = (results[1] as PromiseFulfilledResult<Awaited<typeof guidedTask>>).value;
  let generated = guided.generated;
  let selected = generated.candidates.find(c => c.id === generated.selected_id)!.caption;
  if (normalizeCaption(baseline) === normalizeCaption(selected)) {
    generated = await call("replacement", candidatePrompt(guided.plan, baseline), CANDIDATE_SCHEMA, v => parseCandidates(v, guided.plan));
    selected = generated.candidates.find(c => c.id === generated.selected_id)!.caption;
    if (normalizeCaption(baseline) === normalizeCaption(selected)) throw new Error("Gemini returned the same caption twice. Please retry.");
  }
  return { baseline, guided: selected, candidates: generated, model: MODEL, prompt_version: PROMPT_VERSION, steps, attempts, elapsed_ms: Date.now() - start };
}

import { BASELINE_PROMPT, PLAN_PROMPT, candidatePrompt, MODEL, PROMPT_VERSION, CAPTION_SCHEMA, PLAN_SCHEMA, CANDIDATE_SCHEMA } from "./prompts.ts";
import { parseCaption, parsePlan, parseCandidates, normalizeCaption } from "./schemas.ts";

type ProviderFailure = { http_status: number; provider_status?: string; reason: string; quota_ids: string[]; retry_seconds?: number };
class ProviderError extends Error {
  readonly diagnostic: ProviderFailure;
  constructor(message: string, diagnostic: ProviderFailure) { super(message); this.diagnostic = diagnostic; }
}
export type Step = { stage: string; prompt: string; output?: unknown; usage?: unknown; elapsed_ms: number; error?: string; provider_failure?: ProviderFailure; validation_failure?: string; invalid_output?: string };
async function providerError(response: Response) {
  const body = await response.json().catch(() => ({}));
  const raw = body?.error ?? body;
  const message = typeof raw?.message === "string" ? raw.message : "";
  const details = Array.isArray(raw?.details) ? raw.details : [];
  const quotaIds: string[] = details.flatMap((d: { violations?: { quotaId?: string }[] }) => Array.isArray(d.violations) ? d.violations.map(v => v.quotaId).filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_./-]{1,160}$/.test(id)) : []);
  const retry = details.find((d: { retryDelay?: string }) => typeof d.retryDelay === "string")?.retryDelay;
  const diagnostic: ProviderFailure = {
    http_status: response.status,
    provider_status: ["RESOURCE_EXHAUSTED", "UNAVAILABLE", "INTERNAL", "INVALID_ARGUMENT", "PERMISSION_DENIED", "UNAUTHENTICATED", "NOT_FOUND"].includes(raw?.status) ? raw.status : undefined,
    reason: /quota/i.test(message) ? "quota" : /billing/i.test(message) ? "billing" : /overload|capacity|unavailable/i.test(message) ? "capacity" : "provider_error",
    quota_ids: quotaIds.slice(0, 6),
    retry_seconds: typeof retry === "string" && /^\d+(\.\d+)?s$/.test(retry) ? Number(retry.slice(0, -1)) : undefined,
  };
  return new ProviderError(response.status === 429 ? "Gemini has reached its current rate or quota limit. Please try again later." : response.status >= 500 ? "Gemini is temporarily unavailable. Your image is saved; please retry shortly." : "Gemini could not complete this request.", diagnostic);
}
export async function generatePair(image: Buffer, apiKey: string, options: { request?: typeof fetch; onStep?: (step: Step) => Promise<void>; deadlineMs?: number } = {}) {
  const request = options.request ?? fetch; const start = Date.now();
  const deadline = start + (options.deadlineMs ?? 90000);
  let attempts = 0; const steps: Step[] = [];
  const controller = new AbortController();
  async function call<T>(stage: string, prompt: string, schema: object, parse: (v: unknown) => T): Promise<T> {
    const started = Date.now();
    let rawOutput: string | undefined;
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
      if (!response.ok) throw await providerError(response);
      const result = await response.json() as { status?: string; steps?: { type: string; content?: { type: string; text?: string }[] }[]; usage?: unknown };
      if (result.status !== "completed") throw new Error("Gemini did not complete the caption.");
      const raw = result.steps?.filter(s => s.type === "model_output").flatMap(s => s.content ?? []).filter(p => p.type === "text").map(p => p.text ?? "").join("") ?? "";
      rawOutput = raw;
      const output = JSON.parse(raw); const value = parse(output);
      const step = { stage, prompt, output, usage: result.usage, elapsed_ms: Date.now() - started };
      steps.push(step); await options.onStep?.(step); return value;
    } catch (error) {
      const message = error instanceof Error && /^(Gemini|Caption generation)/.test(error.message) ? error.message : "Gemini returned an incomplete or invalid response. Please retry.";
      const validation = error instanceof SyntaxError ? "invalid_json" : error instanceof Error && /^(Invalid AI|Duplicate detail|Ungrounded|Invalid caption)/.test(error.message) ? error.message : undefined;
      const step = { stage, prompt, error: message, elapsed_ms: Date.now() - started, ...(error instanceof ProviderError ? { provider_failure: error.diagnostic } : {}), ...(rawOutput !== undefined ? { invalid_output: rawOutput.slice(0, 12000), validation_failure: validation } : {}) }; steps.push(step); await options.onStep?.(step);
      throw error instanceof ProviderError ? error : new Error(message);
    }
  }
  async function bounded<T>(task: () => Promise<T>): Promise<T> {
    try { return await task(); } catch (error) {
      // Do not spend another request on quota or configuration failures.
      if (error instanceof ProviderError && error.diagnostic.http_status < 500) throw error;
      if (attempts < 4 && deadline - Date.now() > 5000) {
        if (error instanceof ProviderError) await new Promise(resolve => setTimeout(resolve, 1000));
        return task();
      }
      throw error;
    }
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

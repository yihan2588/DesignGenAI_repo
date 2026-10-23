import { MODEL } from "./prompts.ts";
import { parseCaption, normalizeCaption } from "./schemas.ts";
import { METADATA_PROMPT, METADATA_SCHEMA, parseMetadata } from "./metadata.ts";
import type { Step } from "./pipeline.ts";
const CAPTION_SCHEMA = {
  type: "object",
  properties: { caption: { type: "string", description: "One caption, maximum 240 characters." } },
  required: ["caption"],
};
export type PromptConfig = {
  id: string;
  name: string;
  prompt: string;
  system_prompt: string;
  model: string;
  temperature: number;
};
export const MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
] as const;
export function validateConfig(c: PromptConfig) {
  if (
    !MODELS.includes(c.model as (typeof MODELS)[number]) ||
    (typeof c.temperature !== "number" && (typeof c.temperature !== "string" || !String(c.temperature).trim())) ||
    !Number.isFinite(Number(c.temperature)) ||
    Number(c.temperature) < 0 ||
    Number(c.temperature) > 2 ||
    typeof c.prompt !== "string" || !c.prompt.trim() ||
    c.prompt.length > 12000 ||
    typeof c.system_prompt !== "string" || c.system_prompt.length > 12000
  )
    throw new Error("Invalid prompt configuration.");
}
export async function generateConfiguredPair(
  image: Buffer,
  key: string,
  first: PromptConfig,
  second: PromptConfig,
  options: {
    request?: typeof fetch;
    onStep?: (step: Step) => Promise<void>;
  } = {},
) {
  validateConfig(first);
  validateConfig(second);
  const request = options.request ?? fetch;
  const cancellation = new AbortController();
  const deadline = Date.now() + 90000;
  let attempts = 0;
  async function call<T>(
    stage: string,
    prompt: string,
    schema: object,
    parse: (v: unknown) => T,
    c: PromptConfig,
  ): Promise<T> {
    if (++attempts > 4 || Date.now() > deadline - 1500)
      throw new Error("Caption generation reached its limit. Please retry.");
    const start = Date.now();
    const response = await request(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.any([
          cancellation.signal,
          AbortSignal.timeout(Math.max(1, Math.min(45000, deadline - start))),
        ]),
        body: JSON.stringify({
          model: c.model,
          store: false,
          system_instruction: c.system_prompt,
          input: [
            { type: "text", text: prompt },
            {
              type: "image",
              data: image.toString("base64"),
              mime_type: "image/jpeg",
            },
          ],
          generation_config: {
            max_output_tokens: 1800,
            temperature: Number(c.temperature),
          },
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema,
          },
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? "Gemini quota reached. Please try later."
          : "Gemini could not complete this request. Please retry.",
      );
    const result = await response.json();
    if (result.status !== "completed")
      throw new Error("Gemini did not finish. Please retry.");
    const raw = result.steps
      ?.filter((s: { type: string }) => s.type === "model_output")
      .flatMap(
        (s: { content?: { type: string; text?: string }[] }) => s.content ?? [],
      )
      .filter((s: { type: string }) => s.type === "text")
      .map((s: { text?: string }) => s.text ?? "")
      .join("");
    const output = JSON.parse(raw);
    const parsed = parse(output);
    await options.onStep?.({
      stage,
      prompt,
      output,
      usage: result.usage,
      elapsed_ms: Date.now() - start,
    });
    return parsed;
  }
  // This descriptive call never feeds either caption request.

  async function caption(c: PromptConfig, stage: string, avoid?: string) {
    // All creative instructions come from the immutable editable configuration.
    // The only retry suffix prevents publishing an identical pair and is disclosed in Prompt Lab.
    const prompt = avoid === undefined
      ? c.prompt
      : `${c.prompt}\nDo not repeat this caption: ${JSON.stringify(avoid)}`;
    return call(stage, prompt, CAPTION_SCHEMA, parseCaption, c);
  }
  // All three requests are independent. Settle sibling requests before the caller
  // marks a failed run finished, so no progress writes race with completion.
  const tasks = [
    call("metadata", METADATA_PROMPT, METADATA_SCHEMA, parseMetadata,
      {...first, model: MODEL, temperature: 1, system_prompt: ""}),
    caption(first, "candidate_1"),
    caption(second, "candidate_2"),
  ] as const;
  let failure: unknown;
  const results = await Promise.allSettled(tasks.map(task => task.catch(error => {
    if (failure === undefined) failure = error;
    cancellation.abort();
    throw error;
  })));
  if (results.some(result => result.status === "rejected")) throw failure;
  const [metadata, a, initialB] = await Promise.all(tasks);
  let b = initialB;
  if (normalizeCaption(a) === normalizeCaption(b))
    b = await caption(second, "replacement", a);
  if (normalizeCaption(a) === normalizeCaption(b))
    throw new Error("Gemini returned duplicate captions. Please retry.");
  return {
    baseline: a,
    guided: b,
    metadata,
    prompt_version: "admin-config-v2",
    configuration_ids: [first.id, second.id],
    attempts,
  };
}

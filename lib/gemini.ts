import { parseCaption, type CaptionText } from "./caption-validation.ts";

export const GEMINI_MODEL = "gemini-3.1-flash-lite";

// Called only by the authenticated Server Action. No key is returned or logged.
export async function generateCaption(image: Buffer, prompt: string, apiKey: string,
  request: typeof fetch = fetch): Promise<CaptionText> {
  const response = await request("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: [{ type: "text", text: prompt }, { type: "image", data: image.toString("base64"), mime_type: "image/jpeg" }],
      store: false,
      generation_config: { max_output_tokens: 512 },
      response_format: { type: "text", mime_type: "application/json", schema: {
        type: "object", properties: {
          dish: { type: "string", description: "One short sentence about visible ingredients and likely taste." },
          region: { type: "string", description: "One short sentence about likely cultural region." },
        }, required: ["dish", "region"],
      } },
    }),
  });
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new Error("The AI is busy right now. Please try again later.");
    throw new Error("AI descriptions are temporarily unavailable. Please try again later.");
  }
  const result = await response.json() as { status?: string; steps?: { type: string; content?: { type: string; text?: string }[] }[] };
  if (result.status !== "completed") throw new Error("The AI could not finish this description. Please try again.");
  const text = result.steps?.filter(step => step.type === "model_output").flatMap(step => step.content ?? [])
    .filter(part => part.type === "text").map(part => part.text ?? "").join("");
  try { return parseCaption(JSON.parse(text ?? "")); }
  catch { throw new Error("The AI could not produce two short sentences. Please try again."); }
}

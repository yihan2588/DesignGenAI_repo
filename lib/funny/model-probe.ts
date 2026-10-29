export async function probeModel(model: string, key: string, request: typeof fetch = fetch): Promise<void> {
  if (!/^gemini-[a-z0-9][a-z0-9.-]{1,90}$/.test(model)) throw new Error("Choose a valid Gemini model.");
  const signal = AbortSignal.timeout(12000);
  try {
    const response = await request("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ model, store: false, input: "Return a JSON object with ok set to true.", generation_config: { max_output_tokens: 80 }, response_format: { type: "text", mime_type: "application/json", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } } }),
    });
    if (!response.ok) throw new Error("probe failed");
    const data = await response.json();
    const raw = data.output_text ?? data.steps?.filter((s: { type: string }) => s.type === "model_output").flatMap((s: { content: { type: string; text?: string }[] }) => s.content ?? []).filter((p: { type: string }) => p.type === "text").map((p: { text?: string }) => p.text ?? "").join("");
    if (JSON.parse(raw || "{}").ok !== true) throw new Error("probe failed");
  } catch { throw new Error("This model did not pass the connection and structured-output check. The selected model is unchanged."); }
}

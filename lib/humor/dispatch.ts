export function pipelineMode(value: string | undefined, environment?: string): "mvp" | "worker" {
  // A release preview must never silently substitute the production MVP.
  if (environment === "preview" && value !== "worker") throw new Error("Preview requires the new pipeline.");
  if (value === undefined || value === "" || value === "mvp") return "mvp";
  if (value === "worker") return "worker";
  throw new Error("Invalid HUMOR_PIPELINE_MODE.");
}
export function enqueueReply(error: { message: string } | null, runId: string) {
  if (error) return { status: 503, body: { error: "Caption generation is temporarily unavailable. Please try again later." } };
  return { status: 202, body: { status: "generating", runId } };
}

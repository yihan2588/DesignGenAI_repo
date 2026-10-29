export type Choice = "A" | "B";
export type Plan = { title: string; description: string; details: { id: string; observation: string }[]; conflicts: string[]; angles: { idea: string; detail_ids: string[] }[] };
export type Candidates = { candidates: { id: string; caption: string; detail_ids: string[] }[]; selected_id: string };
export type Poll = { choice: Choice; a: number; b: number; total: number; labels?: Record<Choice,string>; baseline_slot: Choice };
export function captionMethod(slot: Choice, baselineSlot?: Choice, labels?: Record<Choice,string>) {
  if (!baselineSlot) return null;
  return labels?.[slot] ?? (slot === baselineSlot ? "Baseline" : "HOMER-inspired");
}
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function safeReturn(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (["/", "/lab", "/creations", "/profile", "/compare"].includes(value)) return value;
  if (value === "/members") return "/creations";
  if (value === "/upload") return "/lab";
  if (/^\/(?:meme|runs)\/[0-9a-f-]{36}$/.test(value)) return value;
  if (/^\/creations\?tab=(drafts|shared|saved)$/.test(value)) return value;
  if (/^\/(?:lab)?\?mode=(pic|thought)(?:&draft=[0-9a-f-]{36})?$/.test(value)) return value.startsWith('/?') ? '/lab'+value.slice(1) : value;
  if (/^\/lab\?draft=[0-9a-f-]{36}(?:&mode=(pic|thought))?$/.test(value)) return value;
  return "/";
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid AI response.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[<>\u0000-\u0008]/.test(value)) throw new Error("Invalid AI text.");
  return value.trim();
}
function list(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error("Invalid AI list.");
  return value;
}
export function parseCaption(value: unknown): string { return text(record(value).caption, 240); }
export function parsePlan(value: unknown): Plan {
  const obj = record(value);
  const details = list(obj.details, 1, 5).map(v => { const d = record(v); return { id: text(d.id, 12), observation: text(d.observation, 200) }; });
  const ids = new Set(details.map(d => d.id));
  if (ids.size !== details.length) throw new Error("Duplicate detail IDs.");
  const conflicts = list(obj.conflicts, 1, 2).map(v => text(v, 240));
  const angles = list(obj.angles, 3, 3).map(v => { const a = record(v); const detail_ids = list(a.detail_ids, 1, 5).map(v => text(v, 12));
    if (detail_ids.some(id => !ids.has(id))) throw new Error("Ungrounded angle.");
    return { idea: text(a.idea, 240), detail_ids };
  });
  return { title: text(obj.title, 100), description: text(obj.description, 300), details, conflicts, angles };
}
export function parseCandidates(value: unknown, plan: Plan): Candidates {
  const obj = record(value); const ids = new Set(plan.details.map(d => d.id));
  const candidates = list(obj.candidates, 3, 3).map(v => { const c = record(v); const detail_ids = list(c.detail_ids, 1, 5).map(v => text(v, 12));
    if (detail_ids.some(id => !ids.has(id))) throw new Error("Ungrounded candidate.");
    return { id: text(c.id, 12), caption: text(c.caption, 240), detail_ids };
  });
  const selected_id = text(obj.selected_id, 12);
  if (new Set(candidates.map(c => c.id)).size !== 3 || new Set(candidates.map(c => normalizeCaption(c.caption))).size !== 3 || !candidates.some(c => c.id === selected_id)) throw new Error("Invalid caption selection.");
  return { candidates, selected_id };
}
export function normalizeCaption(value: string) { return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); }

import { z } from "zod";
import fontWidths from "./font-widths.json" with {type:"json"};

export const VERSION = "cowriter-1";
export const INDEX_VERSION = "teaching-1-gemini-001-768";
export const MODEL = "gemini-3.1-flash-lite";
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const MAX_WORDS = 14;
export const MAX_CHARS = 90;
export const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
export const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export const captionSchema = z.string().trim().min(1).max(MAX_CHARS).refine(s => wordCount(s) <= MAX_WORDS, "Keep the caption to 14 words or fewer.").refine(s => !/[\r\n\u0000-\u001f]/u.test(s), "Use one line.").refine(s=>Array.from(s).every(c=>Object.hasOwn(fontWidths,c)),"Use Latin letters, numbers and supported punctuation; this meme font does not support emoji.");
const base = { text: z.string().trim().max(700), locks: z.string().trim().max(240).default("") };
export const inputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("pic"), ...base, uploadPath: z.string().regex(/^[\da-f-]{36}\/[\da-f-]{36}\.jpg$/i) }),
  z.object({ mode: z.literal("thought"), ...base, text: z.string().trim().min(3).max(700) }),
]);
export type DraftInput = z.infer<typeof inputSchema>;
export const intentSchema = z.object({
  target: z.string().max(180), spirit: z.string().max(240),
  explicit_constraints: z.array(z.string().max(180)).max(5),
  visual_anchors: z.array(z.string().max(180)).max(5),
  angles: z.array(z.string().max(180)).min(2).max(3),
  search_queries: z.object({ topic: z.string().max(250), relationship: z.string().max(250), visual_analogy: z.string().max(250) }),
});
export type Intent = z.infer<typeof intentSchema>;
export const generatedOptionSchema = z.object({ image_id: z.string().min(1), caption: captionSchema,
  angle: z.string().min(1).max(180), intent_bridge: z.string().min(1).max(240), preserve_on_edit: z.string().min(1).max(180) });
export type GeneratedOption = z.infer<typeof generatedOptionSchema>;
export type Option = GeneratedOption & { id: string; alt: string; width: number; height: number };
export type CatalogImage = { id: string; description: string; affordances: string; family: string; storage_path: string; width: number; height: number; score?: number };
export type State = { id: string; revision: number; input: DraftInput; intent: Intent; options: Option[]; pool: CatalogImage[]; notice?: string; undo_cursor?: number };
export function literalLocks(locks:string){return [...locks.matchAll(/["“]([^"”]+)["”]/gu)].map(m=>m[1]);}
export function keepsLiterals(caption:string,locks:string){return literalLocks(locks).every(text=>caption.includes(text));}
export const editSchema = z.object({ requestId: z.uuid(), sessionId: z.uuid(), revision: z.number().int().min(1), optionId: z.uuid(),
  operation: z.enum(["shorter", "less_obvious", "less_mean", "new_angle", "swap", "manual", "undo"]),
  caption: captionSchema.optional(), imageId: z.uuid().optional() }).superRefine((v, ctx) => {
    if (v.operation === "manual" && !v.caption) ctx.addIssue({code:"custom", message:"Add a caption."});
    if (v.operation === "swap" && !v.imageId) ctx.addIssue({code:"custom", message:"Choose an image."});
  });
export type Edit = z.infer<typeof editSchema>;
export function validOptions(raw: unknown, allowed: Set<string>): GeneratedOption[] {
  const list = z.object({ options: z.array(z.unknown()).max(6) }).parse(raw).options;
  const seen = new Set<string>();
  return list.flatMap(value => {
    const parsed = generatedOptionSchema.safeParse(value);
    if (!parsed.success || !allowed.has(parsed.data.image_id)) return [];
    const key = normalize(parsed.data.caption);
    if (seen.has(key)) return [];
    seen.add(key); return [parsed.data];
  }).slice(0, 3);
}
export function normalizeVector(values: number[]) {
  if (values.length !== 768 || values.some(v => !Number.isFinite(v))) throw new Error("Invalid embedding dimensions.");
  const magnitude = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (!magnitude) throw new Error("Empty embedding.");
  return values.map(v => v / magnitude);
}
// Keep one image per exact media family; rank is a retrieval signal, not humor quality.
export function diversify(images: CatalogImage[], limit = 8) {
  const seen = new Set<string>();
  return images.filter(i => { if (seen.has(i.family)) return false; seen.add(i.family); return true; }).slice(0, limit);
}

"use server";
import { requireAdmin } from "@/lib/admin";
import type { Caption } from "@/lib/caption-validation";
export type VoteState = { error?: string; value?: 1 | -1 };
export type GenerationState = { error?: string; caption?: Caption };
export async function rateCaption(previous: VoteState, _form: FormData): Promise<VoteState> { void _form; await requireAdmin(); return { value: previous.value, error: "Comparison voting is archived." }; }
export async function createDescription(_previous: GenerationState, _form: FormData): Promise<GenerationState> { void _previous; void _form; await requireAdmin(); return { error: "Comparison generation is archived. Use Funny Lab." }; }

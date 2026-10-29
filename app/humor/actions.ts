"use server";
import { requireAdmin } from "@/lib/admin";
import type { Choice, Poll } from "@/lib/humor/schemas";
export async function castVote(_runId: string, _choice?: Choice): Promise<{ poll?: Poll; error?: string }> { void _runId; void _choice; await requireAdmin(); return { error: "Comparison voting is archived." }; }
export async function uploadHumor(_form: FormData): Promise<{ runId?: string; error?: string }> { void _form; await requireAdmin(); return { error: "Use the image library to upload a picture." }; }
export async function retryHumor(_runId: string): Promise<{ runId?: string; error?: string }> { void _runId; await requireAdmin(); return { error: "Comparison generation is archived." }; }

"use server";
import { requireAdmin } from "@/lib/admin";
export type UploadState = { error?: string; photoId?: number };
export async function uploadFoodPhoto(_previous: UploadState, _form: FormData): Promise<UploadState> { void _previous; void _form; await requireAdmin(); return { error: "Use the image library to upload a picture." }; }

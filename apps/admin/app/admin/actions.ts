"use server";
import { requireAdmin } from "@/lib/admin";
export async function mutate(_action: string, _data: Record<string, unknown>): Promise<{ error?: string; ok?: boolean; id?: string }> {
  void _action; void _data;
  await requireAdmin();
  return { error: "The comparison experiment is archived. Use the current admin workspace." };
}

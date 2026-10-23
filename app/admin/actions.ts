"use server";
import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/humor/schemas";
import { requireAdmin } from "@/lib/admin";
export async function mutate(
  action: string,
  data: Record<string, unknown>,
): Promise<{ error?: string; ok?: boolean; id?: string }> {
  const { client } = await requireAdmin();
  const { data: result, error } = await client.rpc("admin_mutate", {
    p_action: action,
    p_data: data,
  });
  if (error) console.error("Admin mutation failed", action, error.code, error.message);
  if (error)
    return {
      error: /Choose two|Replace this|Type DELETE|not found/.test(error.message)
        ? error.message
        : "The change could not be saved. Check the fields and try again.",
    };
  if (action === "delete_media" && result?.storage_path) {
    const { error: cleanup } = await client.storage
      .from("humor-images")
      .remove([result.storage_path]);
    if (cleanup)
      return {
        error:
          "Entry deleted; storage cleanup failed. Refresh to confirm and ask the database operator to remove the unreferenced object.",
      };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, id: isUuid(result?.id) ? result.id : undefined };
}

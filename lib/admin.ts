import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function requireAdmin() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect("/login?next=/admin");
  const { data, error: denied } = await client.rpc("admin_access");
  if (denied || data !== true) redirect("/denied");
  return { client, user };
}
export async function snapshot(page = 1) {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_snapshot", { p_page: page });
  if (error) throw new Error("Admin data could not be loaded. Please retry.");
  return data as import("./admin-types").Snapshot;
}

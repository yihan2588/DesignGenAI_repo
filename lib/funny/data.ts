import "server-only";
import { requireAdmin } from "@/lib/admin";
export async function adminData<T>(area: string, page = 1, query = "", id: string | null = null): Promise<T> {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("funny_admin_snapshot", { p_area: area, p_page: page, p_query: query, p_id: id });
  if (error || !data) throw new Error("This admin view could not be loaded. Please retry.");
  return data as T;
}
export const appOrigin = "https://design-gen-ai-repo.vercel.app";
export const timestamp = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
export const duration = (ms: number | undefined | null) => ms == null ? "Not recorded" : `${(ms / 1000).toFixed(1)}s`;

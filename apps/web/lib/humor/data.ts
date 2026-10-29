import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Poll } from "./schemas";
export type HumorImage = { title: string; alt_text: string; storage_path: string; attribution: string | null };
export type HumorRun = { id: string; image_id: string; status: "pending" | "generating" | "ready" | "failed"; caption_a: string | null; caption_b: string | null; is_example: boolean; created_at: string; deadline_at: string | null; error_message: string | null; humor_images: HumorImage };
const fields = "id,image_id,status,caption_a,caption_b,is_example,created_at,deadline_at,error_message,humor_images(title,alt_text,storage_path,attribution)";
export function imageUrl(path: string) { return `${process.env.SUPABASE_URL}/storage/v1/object/public/humor-images/${path.split('/').map(encodeURIComponent).join('/')}`; }
export async function getFeed(filter: string, page: number, owner?: string) {
  const client = await createClient();
  let q = client.from("humor_runs").select(fields).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (owner) q = q.eq("owner_id", owner); else q = q.eq("status", "ready");
  if (filter === "examples") q = q.eq("is_example", true);
  if (filter === "community") q = q.eq("is_example", false);
  const { data, error } = await q.range((page - 1) * 6, page * 6);
  if (error) throw new Error("The comparisons could not be loaded. Please try again.");
  return { runs: (data ?? []).slice(0, 6) as unknown as HumorRun[], more: (data?.length ?? 0) > 6 };
}
export async function getRun(id: string) {
  const client = await createClient();
  const { data, error } = await client.from("humor_runs").select(fields).eq("id", id).maybeSingle();
  if (error) throw new Error("This comparison could not be loaded.");
  return data as unknown as HumorRun | null;
}
export async function getPolls(ids: string[], userId?: string) {
  const polls = new Map<string, Poll>();
  if (!userId || !ids.length) return polls;
  const client = await createClient();
  const { data, error } = await client.from("humor_votes").select("run_id").eq("user_id", userId).in("run_id", ids);
  if (error) throw new Error("Your saved votes could not be loaded. Please refresh.");
  await Promise.all((data ?? []).map(async row => {
    const { data: poll, error } = await client.rpc("humor_poll", { p_run: row.run_id });
    if (error) throw new Error("Your poll results could not be loaded. Please refresh.");
    polls.set(row.run_id, poll as Poll);
  }));
  return polls;
}

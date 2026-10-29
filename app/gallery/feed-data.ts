import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { GalleryFilter, GalleryResult } from "./types";

export async function galleryFeed(filter: GalleryFilter, page = 1, query = "", id?: string): Promise<GalleryResult> {
  const client = await createClient();
  const { data, error } = await client.rpc("funny_feed", { p_filter: filter, p_page: page, p_query: query.slice(0,120), p_post: id ?? null });
  if (error || !data) throw new Error("The gallery could not be loaded. Please try again.");
  return data as GalleryResult;
}
export function pageNumber(value?: string) { return Math.max(1, Math.min(10000, Number.parseInt(value ?? "1", 10) || 1)); }

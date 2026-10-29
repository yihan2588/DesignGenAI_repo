import { requireAdmin } from "@/lib/admin";
import { adminData, appOrigin } from "@/lib/funny/data";
import { isUuid } from "@/lib/funny/validation";
import type { ActivitySnapshot, LibrarySnapshot } from "@/lib/funny/types";
const reply = (status: number) => new Response("Image unavailable", { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  const { client } = await requireAdmin();
  const url = new URL(request.url), kind = url.searchParams.get("kind"), id = url.searchParams.get("id"), image = url.searchParams.get("image");
  if (!isUuid(id)) return reply(400);
  try {
    let bucket = "", path = "";
    if (kind === "library") {
      const entry = (await adminData<LibrarySnapshot>("library", 1, "", id)).images.find(i => i.id === id);
      if (!entry) return reply(404);
      path = entry.storage_path; bucket = path.startsWith("managed/") ? "funny-library" : "catalog";
    } else if (kind === "post") {
      const { data, error } = await client.rpc("funny_image", { p_id: id });
      if (error || !data) return reply(404);
      bucket = data.bucket; path = data.path;
    } else if (kind === "request" && (image === "upload" || isUuid(image))) {
      const entry = (await adminData<ActivitySnapshot>("activity", 1, "", id)).request;
      if (!entry) return reply(404);
      if (image === "upload") {
        const input = entry.result?.input ?? entry.input;
        if (input?.mode !== "pic" || typeof input.uploadPath !== "string") return reply(404);
        bucket = "cowriter-uploads"; path = input.uploadPath;
      } else {
        path = entry.result?.pool?.find(i => i.id === image)?.storage_path ?? "";
        bucket = path.startsWith("managed/") ? "funny-library" : "catalog";
      }
    } else return reply(400);
    let bytes: ArrayBuffer;
    if (bucket === "catalog" && /^[a-f0-9]{64}\.jpg$/.test(path)) {
      const response = await fetch(`${appOrigin}/catalog/${path}`, { signal: AbortSignal.timeout(6000), redirect: "error", cache: "no-store" });
      if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 2 * 1024 * 1024) return reply(404);
      bytes = await response.arrayBuffer();
    } else {
      const valid = bucket === "funny-library" ? /^managed\/[a-f0-9-]{36}\.jpg$/.test(path) : ["cowriter-uploads", "funny-gallery"].includes(bucket) && /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(path);
      if (!valid) return reply(404);
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) return reply(404);
      bytes = await data.arrayBuffer();
    }
    if (bytes.byteLength > 2 * 1024 * 1024) return reply(413);
    return new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return reply(404); }
}

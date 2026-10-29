import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/humor/schemas";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(); const { id } = await params;
  const options = { headers: { "Cache-Control": "private, no-store" } };
  if (!user) return Response.json({ error: "Sign in to view this run." }, { ...options, status: 401 });
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { ...options, status: 404 });
  const client = await createClient();
  const { data, error } = await client.from("humor_runs").select("id,status,deadline_at,error_message").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error || !data) return Response.json({ error: "Not found." }, { ...options, status: 404 });
  return Response.json(data, options);
}

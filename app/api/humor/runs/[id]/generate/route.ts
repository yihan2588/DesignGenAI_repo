import { requireAdmin } from "@/lib/admin";
export async function POST() { await requireAdmin(); return Response.json({ error: "Comparison generation is archived. Use Funny Lab." }, { status: 410, headers: { "Cache-Control": "private, no-store" } }); }

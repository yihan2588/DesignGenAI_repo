import "server-only";
import { getUser } from "@/lib/auth";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export const requireAdmin = cache(async () => {
  const client = await createClient();
  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  const { data, error: denied } = await client.rpc("admin_access");
  if (denied || data !== true) redirect("/denied");
  return { client, user };
});

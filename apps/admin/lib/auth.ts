import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getUser = cache(async () => {
  const supabase = await createClient();
  // Ask Auth to validate the session, including server-side revocation.
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});

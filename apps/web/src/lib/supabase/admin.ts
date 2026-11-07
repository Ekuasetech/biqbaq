import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A connection using the secret key, which ignores row level security. Only use it for
 * the few actions the database reserves for the server, after checking who is asking.
 */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

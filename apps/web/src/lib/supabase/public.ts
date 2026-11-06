import { createClient } from "@supabase/supabase-js";

/**
 * A connection for public data, acting as a signed-out visitor. It reads no cookies,
 * so results are the same for everyone and safe to cache across visitors.
 */
export function getSupabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

import { createBrowserClient } from "@supabase/ssr";

/** The browser's connection to Supabase. Row level security protects the data. */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createBrowserClient(url, key);
}

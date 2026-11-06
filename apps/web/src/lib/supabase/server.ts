import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * A server connection acting as the signed-in visitor, never with the secret key.
 * It is only used by the email link route for now. When server pages start reading
 * the session, Proxy will also need to refresh it on each request.
 */
export async function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
      },
    },
  });
}

"use server";

import { updateTag } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CATALOG_CACHE_TAG } from "./types";

/**
 * Shows a seller's change on the public pages straight away, rather than within about
 * a minute. It changes no data, so it only needs a signed-in user.
 */
export async function refreshCatalog() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) updateTag(CATALOG_CACHE_TAG);
}

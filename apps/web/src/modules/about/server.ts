import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import type { AboutPage } from "./index";

/** The published About us page, or null while there is none. */
export async function getAboutPage(): Promise<AboutPage | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const { data, error } = await getSupabasePublicClient().from("public_about_page").select("content_en, content_fr, text_en, text_fr, updated_at").maybeSingle();
  if (error) console.error("The About page could not be read", error.code);
  return (data as AboutPage | null) ?? null;
}

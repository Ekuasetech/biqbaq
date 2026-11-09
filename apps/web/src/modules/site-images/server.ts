import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import { resolveSiteImages, type SiteImageRow } from "./index";

/** The front page's photos, cached with the catalogue; Super Admin's changes clear it. */
export async function getSiteImages(locale: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const { data, error } = await getSupabasePublicClient().from("public_site_images").select("slot, image_url, alt_en, alt_fr");
  // The page still shows, with its shipped photos, if this cannot be read.
  if (error) console.error("Site images could not be read", error.code);
  return resolveSiteImages((data ?? []) as SiteImageRow[], locale);
}

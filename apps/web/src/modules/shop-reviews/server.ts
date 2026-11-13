import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import { listSellerReviews } from "./index";

/** A seller page's reviews, cached with the catalogue; a new review clears it (Q-67). */
export async function getSellerReviews(sellerSlug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  return (await listSellerReviews(getSupabasePublicClient(), sellerSlug, 10)) ?? { reviews: [], count: 0, average: null };
}

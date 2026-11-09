import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import type { Testimonial } from "./index";

/** The published quotes, in Super Admin's order. Empty if none, or if they cannot be read. */
export async function getTestimonials(): Promise<Testimonial[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const { data, error } = await getSupabasePublicClient()
    .from("public_testimonials")
    .select("id, quote, name, city")
    .order("sort_order")
    .order("created_at");
  if (error) console.error("Testimonials could not be read", error.code);
  return (data ?? []) as Testimonial[];
}

import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import { isLive, selectAds, type Advertisement, type AdPlacement } from "./select";

export { AD_PLACEMENTS, destinationKind } from "./select";
export type { Advertisement, AdPlacement } from "./select";

interface AdRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  advertiser_name: string;
  image_url: string;
  destination_url: string;
  placements: AdPlacement[];
  priority: number;
  starts_at: string;
  ends_at: string;
}

const toAd = (row: AdRow): Advertisement => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  advertiser: row.advertiser_name,
  imageUrl: row.image_url,
  destinationUrl: row.destination_url,
  active: true,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  priority: row.priority,
  placements: row.placements,
});

/**
 * Ads that are on and within their dates, cached with the catalogue so a change by Super Admin
 * clears them. Callers check the time again, so an ad ends exactly when it should.
 */
async function liveAds(): Promise<{ ads: Advertisement[]; perSection: number }> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const supabase = getSupabasePublicClient();
  const [ads, setting] = await Promise.all([
    supabase.from("public_advertisements").select("*").order("priority", { ascending: false }).limit(200),
    supabase.from("public_platform_settings").select("value").eq("key", "ads.max_per_section").maybeSingle(),
  ]);
  if (ads.error) throw new Error(`Ads lookup failed: ${ads.error.code}`);
  const perSection = Number(setting.data?.value ?? 3);
  return { ads: ((ads.data ?? []) as AdRow[]).map(toAd), perSection: Number.isInteger(perSection) && perSection > 0 ? perSection : 3 };
}

// Pages read ads only through these functions. The frequency control is the number of ads one
// section shows, a Super Admin setting, and an ad never shows twice on its own page.
export async function listLiveAds(placement: AdPlacement, now: Date, limit?: number, excludeSlug?: string): Promise<Advertisement[]> {
  const { ads, perSection } = await liveAds();
  return selectAds(ads, placement, now)
    .filter((ad) => ad.slug !== excludeSlug)
    .slice(0, limit ?? perSection);
}

/** Only a live ad can be opened, on any placement, so finished ads stay hidden. */
export async function getLiveAdBySlug(slug: string, now: Date): Promise<Advertisement | null> {
  const { ads } = await liveAds();
  return ads.find((ad) => ad.slug === slug && isLive(ad, now)) ?? null;
}

export async function listAdSlugs(): Promise<string[]> {
  return (await liveAds()).ads.map((ad) => ad.slug);
}

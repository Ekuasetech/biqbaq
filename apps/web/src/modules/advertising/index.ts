import { SAMPLE_ADS } from "./sample-data";
import { isLive, selectAds, type Advertisement, type AdPlacement } from "./select";

export { destinationKind } from "./select";
export type { Advertisement, AdPlacement } from "./select";

// Pages read ads only through this function, so swapping sample data for
// Supabase does not change any caller.
export async function listLiveAds(
  placement: AdPlacement,
  now: Date,
  limit: number,
  excludeSlug?: string,
): Promise<Advertisement[]> {
  return selectAds(SAMPLE_ADS, placement, now)
    .filter((ad) => ad.slug !== excludeSlug)
    .slice(0, limit);
}

/** Only a live ad can be opened, on any placement, so finished ads stay hidden. */
export async function getLiveAdBySlug(slug: string, now: Date): Promise<Advertisement | null> {
  return SAMPLE_ADS.find((ad) => ad.slug === slug && isLive(ad, now)) ?? null;
}

export async function listAdSlugs(): Promise<string[]> {
  return SAMPLE_ADS.map((ad) => ad.slug);
}

import { SAMPLE_ADS } from "./sample-data";
import { selectAds, type Advertisement, type AdPlacement } from "./select";

export type { Advertisement, AdPlacement } from "./select";

// Pages read ads only through this function, so swapping sample data for
// Supabase does not change any caller.
export async function listLiveAds(placement: AdPlacement, now: Date, limit: number): Promise<Advertisement[]> {
  return selectAds(SAMPLE_ADS, placement, now).slice(0, limit);
}

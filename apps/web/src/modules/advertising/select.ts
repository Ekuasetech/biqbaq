export const AD_PLACEMENTS = ["global", "header", "homepage", "product_listing", "sidebar", "mobile"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

/** An advertisement created by Super Admin (PRD §12). */
export interface Advertisement {
  id: string;
  slug: string;
  title: string;
  description: string;
  advertiser: string;
  imageUrl: string;
  /** An internal path, or an https URL. */
  destinationUrl: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
  /** Higher numbers show first. */
  priority: number;
  placements: AdPlacement[];
}

/**
 * How an ad's destination may be linked. Only internal paths and https URLs are
 * allowed, and "//host" is rejected because browsers treat it as another site.
 */
export function destinationKind(url: string): "internal" | "external" | "invalid" {
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) return "internal";
  return url.startsWith("https://") ? "external" : "invalid";
}

/** Whether an ad is active and within its schedule, whatever its placement. */
export function isLive(ad: Advertisement, now: Date): boolean {
  return ad.active && new Date(ad.startsAt) <= now && now < new Date(ad.endsAt);
}

/** Active ads within their schedule for a placement, highest priority first. */
export function selectAds(ads: Advertisement[], placement: AdPlacement, now: Date): Advertisement[] {
  return ads
    .filter(
      (ad) => ad.placements.includes(placement) && isLive(ad, now),
    )
    .sort((a, b) => b.priority - a.priority);
}

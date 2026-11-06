import type { Advertisement } from "./select";

// SAMPLE DATA for the frontend preview. The advertisers are invented, and stand
// in for ads posted by Super Admin. Remove this file when ad management is built
// (Phase 6). Three ads are deliberately not eligible, to exercise the rules.

function ad(
  index: number,
  title: string,
  advertiser: string,
  destinationUrl: string,
  priority: number,
  extra: Partial<Pick<Advertisement, "active" | "startsAt" | "endsAt">> = {},
): Advertisement {
  return {
    id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title,
    advertiser: `${advertiser} (sample)`,
    // Random placeholder photo: the seed fixes the image, not its subject.
    imageUrl: `https://picsum.photos/seed/biqbaq-ad-${index}/900/600`,
    destinationUrl,
    active: extra.active ?? true,
    startsAt: extra.startsAt ?? "2026-01-01T00:00:00.000Z",
    endsAt: extra.endsAt ?? "2030-01-01T00:00:00.000Z",
    priority,
    placements: ["homepage", "global"],
  };
}

export const SAMPLE_ADS: Advertisement[] = [
  ad(1, "Send your goods home this season", "Maple Freight", "/cargo-cars", 30),
  ad(2, "Stock up on your favourite Nigerian staples", "Naija Foods Canada", "/products?category=food", 20),
  ad(3, "Fresh prints for every occasion", "Ankara House", "/products?category=fashion", 10),
  ad(4, "Inactive ad: never shown", "Hidden Advertiser", "/products", 99, { active: false }),
  ad(5, "Finished ad: never shown", "Past Advertiser", "/products", 98, { endsAt: "2026-01-02T00:00:00.000Z" }),
  ad(6, "Future ad: not shown yet", "Future Advertiser", "/products", 97, { startsAt: "2030-01-01T00:00:00.000Z", endsAt: "2031-01-01T00:00:00.000Z" }),
];

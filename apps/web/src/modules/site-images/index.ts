import { z } from "zod";

/**
 * The front page's own photos, which Super Admin can change (owner's request, 2026-11-08):
 * the hero's three slides, the "Get started on Biqbaq" photo, and the five Shop by category
 * cards. A slot with nothing uploaded shows the photo the site ships with.
 */
export const SITE_IMAGE_SLOTS = [
  "hero_1",
  "hero_2",
  "hero_3",
  "get_started",
  "category_fashion",
  "category_food",
  "category_beauty",
  "category_home",
  "category_cargo_cars",
  // The About us page's photo, changed on that page rather than on Site images.
  "about",
] as const;
export type SiteImageSlot = (typeof SITE_IMAGE_SLOTS)[number];
export const siteImageSlotSchema = z.enum(SITE_IMAGE_SLOTS);
export const SITE_IMAGE_ALT_MAX = 200;

/** The photos the site ships with. */
export const SITE_IMAGE_DEFAULTS: Record<SiteImageSlot, { src: string }> = {
  hero_1: { src: "/hero/nigeria-seller.jpg" },
  hero_2: { src: "/hero/sienna-cargo.jpg" },
  hero_3: { src: "/hero/toronto-professional.jpg" },
  get_started: { src: "/hero/toronto-professional.jpg" },
  // Sample photos until Super Admin uploads real ones.
  category_fashion: { src: "https://picsum.photos/seed/biqbaq-category-fashion/200/200" },
  category_food: { src: "https://picsum.photos/seed/biqbaq-category-food/200/200" },
  category_beauty: { src: "https://picsum.photos/seed/biqbaq-category-beauty/200/200" },
  category_home: { src: "https://picsum.photos/seed/biqbaq-category-home/200/200" },
  category_cargo_cars: { src: "https://picsum.photos/seed/biqbaq-category-cargo-cars/200/200" },
  about: { src: "/hero/toronto-professional.jpg" },
};

/** The Shop by category card's slot: `food` → `category_food`, `cargo-cars` → `category_cargo_cars`. */
export const categorySlot = (key: string) => `category_${key.replaceAll("-", "_")}` as SiteImageSlot;

export interface SiteImageRow {
  slot: string;
  image_url: string;
  alt_en: string;
  alt_fr: string;
}

export interface SiteImage {
  src: string;
  /** Null when the slot shows its shipped photo, so its usual description applies. */
  alt: string | null;
  custom: boolean;
}

/** Each slot's photo for a language: Super Admin's upload, or the shipped one. */
export function resolveSiteImages(rows: SiteImageRow[], locale: string): Record<SiteImageSlot, SiteImage> {
  const result = {} as Record<SiteImageSlot, SiteImage>;
  for (const slot of SITE_IMAGE_SLOTS) {
    const row = rows.find((candidate) => candidate.slot === slot);
    const alt = row ? (locale === "fr" ? row.alt_fr : row.alt_en).trim() : "";
    result[slot] = row ? { src: row.image_url, alt: alt || null, custom: true } : { src: SITE_IMAGE_DEFAULTS[slot].src, alt: null, custom: false };
  }
  return result;
}

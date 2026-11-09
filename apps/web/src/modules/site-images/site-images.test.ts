import { describe, expect, it } from "vitest";
import { isOwnSiteImage } from "@/modules/media-management/rules";
import { categorySlot, resolveSiteImages, siteImageSlotSchema } from "./index";

describe("resolveSiteImages", () => {
  it("shows the site's own photos when nothing is uploaded", () => {
    const images = resolveSiteImages([], "en");
    expect(images.hero_1).toEqual({ src: "/hero/nigeria-seller.jpg", alt: null, custom: false });
    expect(images.get_started.src).toBe("/hero/toronto-professional.jpg");
  });

  it("uses Super Admin's photo, with the description in the visitor's language", () => {
    const rows = [{ slot: "hero_2", image_url: "https://res.cloudinary.com/demo/a.jpg", alt_en: "A van", alt_fr: "Une fourgonnette" }];
    expect(resolveSiteImages(rows, "fr").hero_2).toEqual({ src: "https://res.cloudinary.com/demo/a.jpg", alt: "Une fourgonnette", custom: true });
    expect(resolveSiteImages(rows, "en").hero_2.alt).toBe("A van");
    // Without a description, it is treated as decoration rather than given a wrong one.
    expect(resolveSiteImages([{ ...rows[0], alt_en: " " }], "en").hero_2.alt).toBeNull();
    expect(resolveSiteImages(rows, "en").hero_1.custom).toBe(false);
  });
});

describe("site image slots and files", () => {
  it("accepts only the front page's slots", () => {
    expect(siteImageSlotSchema.safeParse("get_started").success).toBe(true);
    expect(siteImageSlotSchema.safeParse("category_cargo_cars").success).toBe(true);
    expect(categorySlot("cargo-cars")).toBe("category_cargo_cars");
    expect(categorySlot("food")).toBe("category_food");
    expect(siteImageSlotSchema.safeParse("footer").success).toBe(false);
  });

  it("accepts only a file this server named for that slot", () => {
    const id = "6f1c7a2e-0000-4000-8000-000000000000";
    expect(isOwnSiteImage(`biqbaq/site/hero_1/${id}`, "biqbaq", "hero_1")).toBe(true);
    expect(isOwnSiteImage(`biqbaq/site/hero_2/${id}`, "biqbaq", "hero_1")).toBe(false);
    expect(isOwnSiteImage(`biqbaq/ads/x/${id}`, "biqbaq", "hero_1")).toBe(false);
    expect(isOwnSiteImage("biqbaq/site/hero_1/../ads/evil", "biqbaq", "hero_1")).toBe(false);
  });
});

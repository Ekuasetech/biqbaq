import { describe, expect, it } from "vitest";
import { SAMPLE_ADS } from "./sample-data";
import { destinationKind, isLive, selectAds, type Advertisement } from "./select";

const now = new Date("2026-11-05T12:00:00.000Z");
const base: Advertisement = {
  id: "a",
  slug: "ad",
  title: "Ad",
  description: "An ad.",
  advertiser: "Advertiser",
  imageUrl: "/x.jpg",
  destinationUrl: "/products",
  active: true,
  startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: "2026-12-01T00:00:00.000Z",
  priority: 1,
  placements: ["homepage"],
};

describe("destinationKind", () => {
  it("allows internal paths and https only", () => {
    expect(destinationKind("/products?category=food")).toBe("internal");
    expect(destinationKind("https://example.com")).toBe("external");
    for (const unsafe of ["javascript:alert(1)", "http://example.com", "//evil.example", "/\\evil.example", ""]) {
      expect(destinationKind(unsafe)).toBe("invalid");
    }
  });
});

describe("isLive", () => {
  it("does not depend on the placement, so a home page ad's own page still opens", () => {
    expect(isLive({ ...base, placements: ["homepage"] }, now)).toBe(true);
    expect(isLive({ ...base, active: false }, now)).toBe(false);
    expect(isLive({ ...base, endsAt: now.toISOString() }, now)).toBe(false);
  });
});

describe("selectAds", () => {
  it("shows an active ad within its schedule", () => {
    expect(selectAds([base], "homepage", now)).toHaveLength(1);
  });

  it("hides inactive ads", () => {
    expect(selectAds([{ ...base, active: false }], "homepage", now)).toEqual([]);
  });

  it("hides ads before they start, and from the moment they end", () => {
    expect(selectAds([{ ...base, startsAt: "2026-11-06T00:00:00.000Z" }], "homepage", now)).toEqual([]);
    expect(selectAds([{ ...base, endsAt: now.toISOString() }], "homepage", now)).toEqual([]);
    expect(selectAds([{ ...base, startsAt: now.toISOString() }], "homepage", now)).toHaveLength(1);
  });

  it("only returns ads for the requested placement", () => {
    expect(selectAds([{ ...base, placements: ["sidebar"] }], "homepage", now)).toEqual([]);
  });

  it("orders by highest priority first, without changing its input", () => {
    const ads = [{ ...base, id: "low", priority: 1 }, { ...base, id: "high", priority: 9 }];
    expect(selectAds(ads, "homepage", now).map((ad) => ad.id)).toEqual(["high", "low"]);
    expect(ads[0]?.id).toBe("low");
  });

  it("leaves out the deliberately ineligible sample ads", () => {
    const titles = selectAds(SAMPLE_ADS, "homepage", now).map((ad) => ad.title);
    expect(titles).toHaveLength(3);
    expect(titles.join()).not.toMatch(/never shown|not shown/);
  });
});

import { describe, expect, it } from "vitest";
import { canonicalProductUrl, etagFor, matchesEtag, parseApiQuery, sellerSlugSchema, toApiProduct, type PublicProductRow } from "./contract";

const row: PublicProductRow = {
  id: "6f1c7a2e-0000-4000-8000-000000000000",
  slug: "ankara-tote-bag",
  name: "Ankara Tote Bag",
  description: "Handmade.",
  price_minor: 4500,
  currency: "CAD",
  availability: "in_stock",
  images: [{ url: "https://res.cloudinary.com/x.jpg", alt: "A tote" }, { alt: "no url" }, "junk"],
  category_slug: "fashion",
  category_name_en: "Fashion",
  category_name_fr: "Mode",
  first_published_at: "2026-11-07T10:00:00Z",
};

describe("parseApiQuery", () => {
  const parse = (query: string) => parseApiQuery(new URLSearchParams(query));
  it("fills in defaults", () => {
    expect(parse("").data).toEqual({ page: 1, pageSize: 20, sort: "newest", locale: "en" });
    expect(parse("page=&sort=").data?.page).toBe(1);
  });
  it("reads every option", () => {
    expect(parse("page=2&pageSize=5&category=fashion&availability=limited&sort=price_asc&locale=fr").data).toEqual({
      page: 2, pageSize: 5, category: "fashion", availability: "limited", sort: "price_asc", locale: "fr",
    });
  });
  it("refuses what it should", () => {
    for (const bad of ["page=0", "page=1001", "page=1.5", "pageSize=101", "pageSize=0", "sort=random", "availability=gone", "locale=de", "category=Bad%20Cat", "category=a'or'1"]) {
      expect(parse(bad).success, bad).toBe(false);
    }
  });
});

describe("toApiProduct", () => {
  it("builds the documented shape, and nothing else", () => {
    const product = toApiProduct({ ...row, ...({ seller_id: "secret", owner_email: "x@y.ca" } as object) } as PublicProductRow, "https://biqbaq.com/", "en");
    expect(Object.keys(product).sort()).toEqual(["availability", "category", "description", "id", "images", "name", "price", "publishedAt", "slug", "url"]);
    expect(JSON.stringify(product)).not.toContain("secret");
    expect(product.url).toBe("https://biqbaq.com/products/ankara-tote-bag");
    expect(product.price).toEqual({ amountMinor: 4500, currency: "CAD" });
    expect(product.images).toEqual([{ url: "https://res.cloudinary.com/x.jpg", alt: "A tote" }]);
    expect(product.category).toEqual({ slug: "fashion", name: "Fashion" });
  });
  it("speaks French when asked", () => {
    const product = toApiProduct(row, "https://biqbaq.com", "fr");
    expect(product.url).toBe("https://biqbaq.com/fr/products/ankara-tote-bag");
    expect(product.category?.name).toBe("Mode");
  });
  it("copes with no category or images", () => {
    const product = toApiProduct({ ...row, category_slug: null, images: null }, "https://biqbaq.com", "en");
    expect(product.category).toBeNull();
    expect(product.images).toEqual([]);
  });
});

describe("canonicalProductUrl", () => {
  it("cannot be bent into another address by an odd slug", () => {
    expect(canonicalProductUrl("https://biqbaq.com", "../../evil?x=1", "en")).toBe("https://biqbaq.com/products/..%2F..%2Fevil%3Fx%3D1");
  });
});

describe("sellerSlugSchema", () => {
  it("only takes a plain slug", () => {
    expect(sellerSlugSchema.safeParse("abc-store").success).toBe(true);
    for (const bad of ["ABC", "a/b", "", "a b", "x".repeat(121)]) expect(sellerSlugSchema.safeParse(bad).success).toBe(false);
  });
});

describe("ETags", () => {
  it("change with the content, and match what the client sends back", () => {
    const tag = etagFor("one");
    expect(etagFor("one")).toBe(tag);
    expect(etagFor("two")).not.toBe(tag);
    expect(matchesEtag(tag, tag)).toBe(true);
    expect(matchesEtag(`W/${tag}`, tag)).toBe(true);
    expect(matchesEtag(`"other", ${tag}`, tag)).toBe(true);
    expect(matchesEtag('"other"', tag)).toBe(false);
    expect(matchesEtag(null, tag)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { containsFilter, parseProductQuery, toProduct, type ProductRow } from "./query";

describe("parseProductQuery", () => {
  it("keeps valid values", () => {
    expect(parseProductQuery({ q: " suya ", category: "food", market: "CA", sort: "name", page: "2" })).toMatchObject({
      q: "suya",
      category: "food",
      market: "CA",
      sort: "name",
      page: 2,
    });
  });

  it("falls back on anything invalid", () => {
    const query = parseProductQuery({ category: "electronics", market: "US", sort: "drop table", page: "-1", q: "" });
    expect(query).toMatchObject({ sort: "newest", page: 1 });
    expect(query.category).toBeUndefined();
    expect(query.market).toBeUndefined();
    expect(query.q).toBeUndefined();
  });
});

describe("containsFilter", () => {
  it("searches every column", () => {
    expect(containsFilter(["name", "city"], "suya")).toBe('name.ilike."%suya%",city.ilike."%suya%"');
  });

  it("treats wildcards as ordinary characters", () => {
    expect(containsFilter(["name"], "50%_off")).toBe('name.ilike."%50\\\\%\\\\_off%"');
  });

  it("stops typed text escaping into the filter's own syntax", () => {
    expect(containsFilter(["name"], 'a",status.eq.draft')).toBe('name.ilike."%a\\",status.eq.draft%"');
    expect(containsFilter(["name"], "a,b)")).toBe('name.ilike."%a,b)%"');
  });
});

describe("toProduct", () => {
  const row: ProductRow = {
    id: "id",
    slug: "suya",
    name: "Suya",
    description: "Smoky",
    price_minor: 1200,
    currency: "CAD",
    availability: "limited",
    condition: null,
    images: [{ url: "https://example.com/a.jpg", alt: "A" }],
    view_count: 7,
    first_published_at: "2026-10-01T00:00:00Z",
    category_slug: "food",
    seller_slug: "shop",
    seller_name: "Shop",
    seller_city: "Toronto",
    seller_country: "CA",
    seller_description: "Words",
    seller_verified: false,
  };

  it("maps a public row to what the pages show", () => {
    const product = toProduct(row);
    expect(product.price).toEqual({ amountMinor: 1200, currency: "CAD" });
    expect(product.seller).toEqual({ name: "Shop", slug: "shop", city: "Toronto", country: "CA", verified: false, description: "Words" });
    expect(product.views).toBe(7);
    expect(product.images).toHaveLength(1);
  });
});

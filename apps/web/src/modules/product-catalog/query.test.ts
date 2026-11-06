import { describe, expect, it } from "vitest";
import { parseProductQuery, queryProducts } from "./query";
import { SAMPLE_PRODUCTS } from "./sample-data";

const base = { sort: "newest", page: 1, pageSize: 100 } as const;

describe("parseProductQuery", () => {
  it("falls back to defaults for invalid values", () => {
    const q = parseProductQuery({ category: "nope", market: "US", sort: "x", page: "-3", q: "  " });
    expect(q).toMatchObject({ sort: "newest", page: 1 });
    expect(q.category).toBeUndefined();
    expect(q.market).toBeUndefined();
    expect(q.q).toBeUndefined();
  });

  it("keeps valid values and trims the search term", () => {
    const q = parseProductQuery({ category: "food", market: "CA", sort: "name", page: "2", q: " suya " });
    expect(q).toMatchObject({ category: "food", market: "CA", sort: "name", page: 2, q: "suya" });
  });

  it("uses the first value of a repeated param", () => {
    expect(parseProductQuery({ category: ["food", "home"] }).category).toBe("food");
  });
});

describe("sample catalogue", () => {
  it("is priced in Canadian dollars, from sellers in Canada", () => {
    expect(SAMPLE_PRODUCTS.every((p) => p.price.currency === "CAD" && p.seller.country === "CA")).toBe(true);
    expect(SAMPLE_PRODUCTS.every((p) => p.seller.city.length > 0)).toBe(true);
  });
});

describe("queryProducts", () => {
  it("filters by category, market and search term", () => {
    expect(queryProducts(SAMPLE_PRODUCTS, { ...base, category: "food" }).data.every((p) => p.category === "food")).toBe(true);
    expect(queryProducts(SAMPLE_PRODUCTS, { ...base, market: "CA" }).data).toHaveLength(12);
    expect(queryProducts(SAMPLE_PRODUCTS, { ...base, market: "NG" }).data).toHaveLength(0);
    expect(queryProducts(SAMPLE_PRODUCTS, { ...base, q: "SUYA" }).data.map((p) => p.slug)).toEqual(["suya-spice-blend"]);
  });

  it("finds products by seller name and by seller city", () => {
    const byName = queryProducts(SAMPLE_PRODUCTS, { ...base, q: "kano naturals" }).data;
    expect(byName.length).toBeGreaterThan(0);
    expect(byName.every((p) => p.seller.slug === "kano-naturals")).toBe(true);
    const byCity = queryProducts(SAMPLE_PRODUCTS, { ...base, q: "calgary" }).data;
    expect(byCity.length).toBeGreaterThan(0);
    expect(byCity.every((p) => p.seller.city === "Calgary")).toBe(true);
  });

  it("paginates, and clamps a page past the end", () => {
    const first = queryProducts(SAMPLE_PRODUCTS, { sort: "newest", page: 1, pageSize: 5 });
    expect(first.data).toHaveLength(5);
    expect(first.meta).toMatchObject({ total: 12, totalPages: 3 });
    const beyond = queryProducts(SAMPLE_PRODUCTS, { sort: "newest", page: 99, pageSize: 5 });
    expect(beyond.meta.page).toBe(3);
    expect(beyond.data).toHaveLength(2);
  });

  it("never compares prices across currencies", () => {
    // The launch is CAD only (ADR-0005), but the sort must stay safe for later.
    const mixed = SAMPLE_PRODUCTS.map((p, i) =>
      i % 2 ? { ...p, price: { ...p.price, currency: "NGN" as const } } : p,
    );
    const { data } = queryProducts(mixed, { ...base, sort: "price_asc" });
    const cad = data.filter((p) => p.price.currency === "CAD").map((p) => p.price.amountMinor);
    const ngn = data.filter((p) => p.price.currency === "NGN").map((p) => p.price.amountMinor);
    expect(cad).toEqual([...cad].sort((a, b) => a - b));
    expect(ngn).toEqual([...ngn].sort((a, b) => a - b));
    expect(data.findIndex((p) => p.price.currency === "NGN")).toBe(cad.length);
  });

  it("does not mutate its input", () => {
    const before = SAMPLE_PRODUCTS.map((p) => p.id);
    queryProducts(SAMPLE_PRODUCTS, { ...base, sort: "name" });
    expect(SAMPLE_PRODUCTS.map((p) => p.id)).toEqual(before);
  });
});

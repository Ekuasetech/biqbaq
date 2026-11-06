import { describe, expect, it, vi } from "vitest";
import type { Product, PublicSeller } from "@/modules/product-catalog";
import { suggest } from "./index";

// Tests the ranking and limits here. Browser tests cover searching the real database.
const seller = (name: string, slug: string, city: string): PublicSeller => ({ name, slug, city, country: "CA", verified: false, description: "" });
const kano = seller("Kano Naturals", "kano-naturals", "Ottawa");
const lagos = seller("Lagos Pantry", "lagos-pantry", "Calgary");
const adire = seller("Adire Studio", "adire-studio", "Toronto");
const product = (name: string, slug: string, owner: PublicSeller) =>
  ({ id: slug, slug, name, description: "", seller: owner, images: [], price: { amountMinor: 100, currency: "CAD" } }) as unknown as Product;
const catalogue = [
  product("Suya Spice Blend", "suya-spice-blend", lagos),
  product("Whipped Shea Butter", "whipped-shea-butter", kano),
  product("Raffia Wall Basket", "raffia-wall-basket", adire),
  product("Adire Silk Scarf", "adire-silk-scarf", adire),
  ...["One", "Two", "Three", "Four", "Five", "Six"].map((n) => product(`Toronto Print ${n}`, `print-${n}`, adire)),
];
const contains = (texts: string[], needle: string) => texts.some((text) => text.toLowerCase().includes(needle.toLowerCase()));

vi.mock("@/modules/product-catalog", () => ({
  listProducts: async ({ q }: { q: string }) => ({
    data: catalogue.filter((p) => contains([p.name, p.seller.name, p.seller.city], q)),
  }),
  searchSellers: async (q: string) => [kano, lagos, adire].filter((s) => contains([s.name, s.city], q)),
}));

describe("suggest", () => {
  it("returns nothing for very short terms", async () => {
    expect(await suggest("")).toEqual([]);
    expect(await suggest(" a ")).toEqual([]);
  });

  it("finds products by name, ignoring case", async () => {
    const results = await suggest("SUYA");
    expect(results.map((r) => r.title)).toEqual(["Suya Spice Blend"]);
    expect(results[0]?.href).toBe("/products/suya-spice-blend");
  });

  it("finds products by seller and city", async () => {
    expect((await suggest("kano naturals")).length).toBeGreaterThan(0);
    expect((await suggest("calgary")).some((r) => r.type === "product")).toBe(true);
  });

  it("finds cars by model and by route", async () => {
    const sienna = await suggest("sienna");
    expect(sienna[0]).toMatchObject({ type: "car", title: "2021 Toyota Sienna", href: "/cargo-cars/2021-toyota-sienna" });
    const abuja = await suggest("abuja");
    expect(abuja.filter((r) => r.type === "car")).toHaveLength(3);
  });

  it("finds sellers by name and city, linking to their profiles", async () => {
    expect((await suggest("kano"))[0]).toMatchObject({ type: "seller", href: "/sellers/kano-naturals" });
    expect((await suggest("ottawa")).filter((r) => r.type === "seller").map((r) => r.href)).toEqual(["/sellers/kano-naturals"]);
  });

  it("puts titles starting with the term first", async () => {
    const results = await suggest("ad");
    const products = results.filter((r) => r.type === "product");
    expect(products[0]?.title.toLowerCase().startsWith("ad")).toBe(true);
  });

  it("limits the list, with products before cars", async () => {
    const results = await suggest("toronto");
    const types = results.map((r) => r.type);
    expect(results.filter((r) => r.type === "product").length).toBeLessThanOrEqual(5);
    expect(results.filter((r) => r.type === "car").length).toBeLessThanOrEqual(3);
    expect(types.lastIndexOf("product")).toBeLessThan(types.indexOf("car"));
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await suggest("zzzz")).toEqual([]);
  });
});

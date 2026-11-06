import { describe, expect, it } from "vitest";
import { suggest } from "./index";

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

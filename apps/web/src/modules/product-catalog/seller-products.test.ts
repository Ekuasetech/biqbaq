import { describe, expect, it } from "vitest";
import { priceInputValue, productFormSchema, shopErrorKey } from "./seller-products";

const form = { name: " Suya ", description: "", category_id: "", price: "12.50", availability: "in_stock", condition: "" };

describe("productFormSchema", () => {
  it("accepts a draft with only a name and price", () => {
    expect(productFormSchema.parse(form)).toEqual({
      name: "Suya",
      description: "",
      category_id: null,
      price: 1250,
      availability: "in_stock",
      condition: null,
    });
  });

  it("stores exact cents, without rounding errors", () => {
    expect(productFormSchema.parse({ ...form, price: "19.99" }).price).toBe(1999);
    expect(productFormSchema.parse({ ...form, price: "1.10" }).price).toBe(110);
    expect(productFormSchema.parse({ ...form, price: "9999999.99" }).price).toBe(999999999);
    expect(priceInputValue(1250)).toBe("12.50");
  });

  it("accepts a price of $0", () => {
    expect(productFormSchema.parse({ ...form, price: "0" }).price).toBe(0);
    expect(productFormSchema.parse({ ...form, price: "0.00" }).price).toBe(0);
  });

  it.each(["", "abc", "-5", "1.234", "1,50", "99999999"])("refuses the price %j", (price) => {
    expect(productFormSchema.safeParse({ ...form, price }).success).toBe(false);
  });

  it("refuses a blank name and any unknown availability", () => {
    expect(productFormSchema.safeParse({ ...form, name: "  " }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...form, availability: "free" }).success).toBe(false);
  });
});

describe("shopErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(shopErrorKey({ code: "55000", message: "PUBLISH_ALLOWANCE_EXHAUSTED" })).toBe("allowanceUsed");
    expect(shopErrorKey({ code: "23514", message: "PRODUCT_INCOMPLETE" })).toBe("incomplete");
    expect(shopErrorKey({ code: "42501", message: "new row violates row-level security policy" })).toBe("notAllowed");
    expect(shopErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

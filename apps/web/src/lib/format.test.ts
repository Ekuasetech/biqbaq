import { describe, expect, it } from "vitest";
import { averageRating, formatPrice } from "./format";

describe("formatPrice", () => {
  it("formats minor units in each currency", () => {
    expect(formatPrice({ amountMinor: 4500, currency: "CAD" }, "en")).toBe("$45.00");
    expect(formatPrice({ amountMinor: 1250000, currency: "NGN" }, "en")).toBe("₦12,500.00");
  });
  it("uses French conventions for the fr locale", () => {
    expect(formatPrice({ amountMinor: 4500, currency: "CAD" }, "fr")).toMatch(/^45,00\s\$$/);
  });
});

describe("averageRating", () => {
  it("rounds to one decimal, and is null with no ratings", () => {
    expect(averageRating([5, 4, 4])).toBe(4.3);
    expect(averageRating([])).toBeNull();
  });
});

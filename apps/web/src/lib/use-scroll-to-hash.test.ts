import { describe, expect, it } from "vitest";
import { itemMayBeLater } from "./use-scroll-to-hash";

describe("itemMayBeLater", () => {
  it("looks on later pages for an item a search result named", () => {
    expect(itemMayBeLater("invoice-i9", "invoice-", ["i1", "i2"], 1, 2, 5)).toBe(true);
  });
  it("stops when the item is on this page, or the pages run out", () => {
    expect(itemMayBeLater("invoice-i2", "invoice-", ["i1", "i2"], 1, 2, 5)).toBe(false);
    expect(itemMayBeLater("invoice-i9", "invoice-", ["i5"], 3, 2, 5)).toBe(false);
    expect(itemMayBeLater("invoice-i9", "invoice-", [], 50, 1, 500)).toBe(false);
  });
  it("ignores an address naming something else, or nothing", () => {
    expect(itemMayBeLater("product-p1", "invoice-", [], 1, 2, 5)).toBe(false);
    expect(itemMayBeLater("", "invoice-", [], 1, 2, 5)).toBe(false);
    expect(itemMayBeLater("invoice-", "invoice-", [], 1, 2, 5)).toBe(false);
  });
});

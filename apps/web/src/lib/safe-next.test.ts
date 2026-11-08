import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("returns to a page on this site", () => {
    expect(safeNext("/products/suya-spice-blend")).toBe("/products/suya-spice-blend");
    expect(safeNext("/account/messages?c=1")).toBe("/account/messages?c=1");
  });
  it("never sends someone to another site", () => {
    for (const next of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      expect(safeNext(next)).toBe("/");
    }
  });
});

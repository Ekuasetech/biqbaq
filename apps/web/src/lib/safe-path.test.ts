import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-path";

describe("safeInternalPath", () => {
  it("keeps paths on this site", () => {
    expect(safeInternalPath("/reset-password")).toBe("/reset-password");
    expect(safeInternalPath("/fr")).toBe("/fr");
  });

  it("refuses anything that could lead to another site", () => {
    for (const unsafe of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "evil", ""]) {
      expect(safeInternalPath(unsafe)).toBe("/");
    }
    expect(safeInternalPath(null, "/fr")).toBe("/fr");
  });
});

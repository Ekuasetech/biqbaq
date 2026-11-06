import { describe, expect, it } from "vitest";
import { placesLeft } from "./index";

describe("placesLeft", () => {
  it("counts down for unverified sellers, and stops at zero", () => {
    expect(placesLeft({ verified: false, used: 0, allowance: 2 })).toBe(2);
    expect(placesLeft({ verified: false, used: 2, allowance: 2 })).toBe(0);
    expect(placesLeft({ verified: false, used: 3, allowance: 1 })).toBe(0);
  });

  it("has no limit for verified sellers", () => {
    expect(placesLeft({ verified: true, used: 50, allowance: 2 })).toBeNull();
  });
});

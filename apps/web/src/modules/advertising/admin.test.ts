import { describe, expect, it } from "vitest";
import { adErrorKey, adSchema, adState } from "./admin";

const valid = { title: "T", advertiser: "A", description: "", destination: "/products", placements: ["homepage"], priority: "10", startsAt: "2026-11-01T00:00", endsAt: "2026-12-01T00:00" };
const first = (input: object) => adSchema.safeParse({ ...valid, ...input }).error?.issues[0]?.message;

describe("adSchema", () => {
  it("accepts a complete ad", () => {
    expect(adSchema.parse(valid).priority).toBe(10);
  });
  it("only links to Biqbaq pages or secure addresses", () => {
    expect(adSchema.safeParse({ ...valid, destination: "https://maple-freight.ca" }).success).toBe(true);
    for (const bad of ["javascript:alert(1)", "http://insecure.ca", "//evil.com", "", "/\\evil.com"]) expect(first({ destination: bad }), bad).toBe("destinationInvalid");
  });
  it("needs a place to show, sensible dates and priority", () => {
    expect(first({ placements: [] })).toBe("placementRequired");
    expect(first({ placements: ["sidebar"] })).toBeTruthy();
    expect(first({ endsAt: "2026-10-01T00:00" })).toBe("datesInvalid");
    expect(first({ priority: "1001" })).toBe("priorityInvalid");
    expect(first({ priority: "2.5" })).toBe("priorityInvalid");
  });
});

describe("adState", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const ad = { active: true, starts_at: "2026-11-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z" };
  it("tells live, scheduled, off and ended apart", () => {
    expect(adState(ad, now)).toBe("live");
    expect(adState({ ...ad, starts_at: "2026-11-10T00:00:00Z" }, now)).toBe("scheduled");
    expect(adState({ ...ad, active: false }, now)).toBe("off");
    expect(adState({ ...ad, ends_at: "2026-11-05T00:00:00Z" }, now)).toBe("ended");
  });
});

describe("adErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(adErrorKey({ code: "23514", message: "AD_INCOMPLETE" })).toBe("needsImage");
    expect(adErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(adErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

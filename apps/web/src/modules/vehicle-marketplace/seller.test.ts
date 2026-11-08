import { describe, expect, it } from "vitest";
import { parseRestrictions, vehicleErrorKey, vehicleSchema } from "./seller";

const valid = { make: "Toyota", model: "Sienna", year: "2021", origin: "Toronto", destination: "Lagos", departure: "2027-01-01", availableKg: "300", restrictions: [], cargoStatus: "accepting_cargo" };
const first = (input: object) => vehicleSchema.safeParse({ ...valid, ...input }).error?.issues[0]?.message;

describe("vehicleSchema", () => {
  it("accepts a complete trip", () => {
    expect(vehicleSchema.parse(valid)).toMatchObject({ year: 2021, availableKg: 300 });
  });
  it("refuses what the database would", () => {
    expect(first({ make: " " })).toBe("required");
    expect(first({ year: "1970" })).toBe("yearInvalid");
    expect(first({ availableKg: "-1" })).toBe("kgInvalid");
    expect(first({ availableKg: "2.5" })).toBe("kgInvalid");
    expect(first({ availableKg: "abc" })).toBe("kgInvalid");
    expect(first({ year: "soon" })).toBe("yearInvalid");
    expect(first({ departure: "next week" })).toBe("departureInvalid");
    expect(first({ restrictions: Array.from({ length: 11 }, (_, i) => `r${i}`) })).toBe("tooManyRestrictions");
  });
});

describe("parseRestrictions", () => {
  it("takes one per line, dropping blanks", () => {
    expect(parseRestrictions(" No food \n\n  No liquids\r\n")).toEqual(["No food", "No liquids"]);
  });
});

describe("vehicleErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(vehicleErrorKey({ code: "42501", message: "VERIFICATION_REQUIRED" })).toBe("verificationRequired");
    expect(vehicleErrorKey({ code: "23514", message: "LISTING_INCOMPLETE" })).toBe("needsPhoto");
    expect(vehicleErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

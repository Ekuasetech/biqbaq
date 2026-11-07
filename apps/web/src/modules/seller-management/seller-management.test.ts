import { describe, expect, it } from "vitest";
import { shopProfileErrorKey, shopProfileSchema } from "./index";

const valid = { name: "Ada's Shop", city: "Toronto", category: "food", description: "Good food", contact_information: "416-555-0100" };
const firstError = (input: object) => shopProfileSchema.safeParse(input).error?.issues[0]?.message;

describe("shopProfileSchema", () => {
  it("accepts and trims complete details", () => {
    expect(shopProfileSchema.parse({ ...valid, name: "  Ada  " }).name).toBe("Ada");
  });
  it("requires every field", () => {
    for (const field of Object.keys(valid)) {
      expect(firstError({ ...valid, [field]: "   " })).toBe("required");
      expect(firstError({ ...valid, [field]: undefined })).toBe("required");
    }
  });
  it("applies the same limits as the database", () => {
    expect(firstError({ ...valid, name: "x".repeat(151) })).toBe("tooLong");
    expect(firstError({ ...valid, city: "x".repeat(101) })).toBe("tooLong");
    expect(firstError({ ...valid, description: "x".repeat(1001) })).toBe("tooLong");
    expect(firstError({ ...valid, contact_information: "x".repeat(201) })).toBe("tooLong");
    expect(shopProfileSchema.safeParse({ ...valid, name: "x".repeat(150), description: "x".repeat(1000) }).success).toBe(true);
  });
});

describe("shopProfileErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(shopProfileErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(shopProfileErrorKey({ code: "23514", message: "DETAILS_REQUIRED" })).toBe("required");
    expect(shopProfileErrorKey({ code: "23514", message: "DETAILS_TOO_LONG" })).toBe("tooLong");
    expect(shopProfileErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

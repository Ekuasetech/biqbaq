import { describe, expect, it } from "vitest";
import { hasAnyAccess, moderationErrorKey, NO_ACCESS } from "./index";

describe("hasAnyAccess", () => {
  it("is true for any one permission, and false for none", () => {
    expect(hasAnyAccess(NO_ACCESS)).toBe(false);
    expect(hasAnyAccess({ ...NO_ACCESS, products: true })).toBe(true);
    expect(hasAnyAccess({ ...NO_ACCESS, shops: true })).toBe(true);
    expect(hasAnyAccess({ ...NO_ACCESS, publishing: true })).toBe(true);
  });
});

describe("moderationErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(moderationErrorKey({ code: "23514", message: "REASON_REQUIRED" })).toBe("reasonRequired");
    expect(moderationErrorKey({ code: "23514", message: "REASON_TOO_LONG" })).toBe("reasonTooLong");
    expect(moderationErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(moderationErrorKey({ code: "42501", message: "CANNOT_MODERATE_OWN" })).toBe("ownShop");
    expect(moderationErrorKey({ code: "55000", message: "SELLER_ROLE_NOT_ACTIVE" })).toBe("roleInactive");
    expect(moderationErrorKey({ code: "55000", message: "PRODUCT_NOT_SUSPENDABLE" })).toBe("changed");
    expect(moderationErrorKey({ code: "P0002", message: "SELLER_NOT_FOUND" })).toBe("changed");
    expect(moderationErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

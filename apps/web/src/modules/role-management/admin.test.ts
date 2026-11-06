import { describe, expect, it } from "vitest";
import { adminErrorKey } from "./admin";

describe("adminErrorKey", () => {
  it("maps refused decisions to messages, without exposing their wording", () => {
    expect(adminErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(adminErrorKey({ code: "55000", message: "APPLICATION_NOT_PENDING" })).toBe("alreadyDecided");
    expect(adminErrorKey({ code: "23514", message: "REASON_REQUIRED" })).toBe("reasonRequired");
    expect(adminErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

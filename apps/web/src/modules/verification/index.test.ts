import { describe, expect, it } from "vitest";
import { actionsFor, canRequest, isVerified, verificationErrorKey } from "./index";

describe("verification rules on screen", () => {
  it("treats only the two verified statuses as verified", () => {
    expect(isVerified("provider_verified")).toBe(true);
    expect(isVerified("manually_verified")).toBe(true);
    for (const status of ["unverified", "pending", "rejected", "suspended", "expired"] as const) expect(isVerified(status)).toBe(false);
  });

  it("offers a request only where the database allows one", () => {
    expect(canRequest("unverified")).toBe(true);
    expect(canRequest("rejected")).toBe(true);
    expect(canRequest("expired")).toBe(true);
    for (const status of ["pending", "provider_verified", "manually_verified", "suspended"] as const) expect(canRequest(status)).toBe(false);
  });

  it("offers Super Admin only the allowed changes", () => {
    expect(actionsFor("manually_verified")).toEqual(["suspend", "revoke"]);
    expect(actionsFor("provider_verified")).toEqual(["suspend", "revoke"]);
    expect(actionsFor("suspended")).toEqual(["restore", "revoke"]);
    expect(actionsFor("pending")).toEqual([]);
    expect(actionsFor("unverified")).toEqual(["verify"]);
    expect(actionsFor("rejected")).toEqual(["verify"]);
    expect(actionsFor("expired")).toEqual(["verify"]);
  });
});

describe("verificationErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(verificationErrorKey({ code: "23514", message: "REASON_REQUIRED" })).toBe("reasonRequired");
    expect(verificationErrorKey({ code: "23514", message: "NOTE_REQUIRED" })).toBe("noteRequired");
    expect(verificationErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(verificationErrorKey({ code: "55000", message: "REQUEST_NOT_PENDING" })).toBe("changed");
    expect(verificationErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

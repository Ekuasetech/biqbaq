import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { can, inviteSchema, permissionMessageKey, STAFF_PERMISSIONS, staffErrorKey, staffShopState } from "./index";

describe("STAFF_PERMISSIONS", () => {
  it("has a label in both languages", () => {
    for (const key of STAFF_PERMISSIONS) {
      const name = permissionMessageKey(key) as keyof typeof en.staff.permissionNames;
      expect(en.staff.permissionNames[name], key).toBeTruthy();
      expect(fr.staff.permissionNames[name], key).toBeTruthy();
    }
  });
});

describe("can", () => {
  it("is false without access or the permission", () => {
    expect(can(null, "products.edit")).toBe(false);
    expect(can({ is_owner: false, permissions: ["products.create"] }, "products.edit")).toBe(false);
    expect(can({ is_owner: false, permissions: ["products.edit"] }, "products.edit")).toBe(true);
  });
});

describe("staffShopState", () => {
  const ready = { status: "active" as const, shop_active: true, role_active: true };
  it("needs the seller's approval and an unblocked role", () => {
    expect(staffShopState(ready)).toBe("ready");
    expect(staffShopState({ ...ready, status: "pending", role_active: false })).toBe("awaitingSeller");
    expect(staffShopState({ ...ready, role_active: false })).toBe("roleBlocked");
    expect(staffShopState({ ...ready, status: "suspended" })).toBe("suspended");
    expect(staffShopState({ ...ready, shop_active: false })).toBe("shopSuspended");
  });
});

describe("inviteSchema", () => {
  it("accepts an address and refuses anything else", () => {
    expect(inviteSchema.safeParse({ email: "ada@mail.ca" }).success).toBe(true);
    expect(inviteSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.ca\nBcc: x@y.ca" }).success).toBe(false);
  });
});

describe("staffErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(staffErrorKey({ code: "55000", message: "ALREADY_STAFF" })).toBe("alreadyStaff");
    expect(staffErrorKey({ code: "P0001", message: "RATE_LIMITED" })).toBe("rateLimited");
    expect(staffErrorKey({ code: "55000", message: "STAFF_ROLE_BLOCKED" })).toBe("roleBlocked");
    expect(staffErrorKey({ code: "42501", message: "CANNOT_CHANGE_OWN_ACCESS" })).toBe("ownAccess");
    expect(staffErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(staffErrorKey({ code: "55000", message: "INVITATION_NOT_PENDING" })).toBe("changed");
    expect(staffErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

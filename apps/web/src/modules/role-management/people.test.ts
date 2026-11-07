import { describe, expect, it } from "vitest";
import { assignableRolesFor, permissionChanges, roleActions, roleErrorKey } from "./people";

describe("permissionChanges", () => {
  it("only changes what differs", () => {
    expect(permissionChanges(["a", "b"], ["b", "c"])).toEqual({ grant: ["c"], revoke: ["a"] });
    expect(permissionChanges(["a"], ["a"])).toEqual({ grant: [], revoke: [] });
  });
});

describe("roleActions", () => {
  it("offers nothing for Buyer or a removed role", () => {
    expect(roleActions({ role_key: "buyer", status: "active" })).toEqual([]);
    expect(roleActions({ role_key: "admin", status: "revoked" })).toEqual([]);
  });
  it("offers the right next step", () => {
    expect(roleActions({ role_key: "seller", status: "active" })).toEqual(["suspend", "revoke"]);
    expect(roleActions({ role_key: "seller", status: "suspended" })).toEqual(["restore", "revoke"]);
  });
  it("offers permissions only where they apply", () => {
    expect(roleActions({ role_key: "admin", status: "active" })).toContain("permissions");
    expect(roleActions({ role_key: "co_admin", status: "suspended" })).toContain("permissions");
    expect(roleActions({ role_key: "marketer", status: "active" })).not.toContain("permissions");
    expect(roleActions({ role_key: "super_admin", status: "active" })).not.toContain("permissions");
  });
});

describe("assignableRolesFor", () => {
  it("leaves out roles held, even if suspended, and offers removed ones again", () => {
    const roles = assignableRolesFor([
      { role_key: "buyer", status: "active" },
      { role_key: "admin", status: "suspended" },
      { role_key: "marketer", status: "revoked" },
    ]);
    expect(roles).toEqual(["co_admin", "marketer", "super_admin"]);
  });
  it("never offers Seller, which needs an application", () => {
    expect(assignableRolesFor([])).not.toContain("seller");
  });
});

describe("roleErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(roleErrorKey({ code: "55000", message: "LAST_SUPER_ADMIN" })).toBe("lastSuperAdmin");
    expect(roleErrorKey({ code: "23514", message: "REASON_REQUIRED" })).toBe("reasonRequired");
    expect(roleErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(roleErrorKey({ code: "55000", message: "INVALID_STATUS_CHANGE" })).toBe("changed");
    expect(roleErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

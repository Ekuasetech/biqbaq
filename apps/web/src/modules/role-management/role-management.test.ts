import { describe, expect, it } from "vitest";
import {
  applicationErrorKey,
  applicationSchemas,
  rolesOpenForApplication,
  type RoleApplication,
  type UserRole,
} from "./index";

const role = (role_key: UserRole["role_key"], status: UserRole["status"] = "active"): UserRole => ({
  id: role_key,
  role_key,
  status,
  status_reason: null,
});
const application = (role_key: RoleApplication["role_key"], status: RoleApplication["status"]): RoleApplication => ({
  id: role_key,
  role_key,
  status,
  rejection_reason: null,
  created_at: "2026-11-06T00:00:00.000Z",
});

describe("rolesOpenForApplication", () => {
  it("offers every applicable role to a new Buyer, and never Buyer, Co-admin or Super Admin", () => {
    expect(rolesOpenForApplication([role("buyer")], [])).toEqual(["seller", "marketer", "admin"]);
  });

  it("hides roles already held or suspended, but allows revoked ones again", () => {
    const roles = [role("seller"), role("marketer", "suspended"), role("admin", "revoked")];
    expect(rolesOpenForApplication(roles, [])).toEqual(["admin"]);
  });

  it("hides roles with an open application, but allows applying again after a decision", () => {
    const applications = [application("seller", "pending"), application("marketer", "rejected"), application("admin", "withdrawn")];
    expect(rolesOpenForApplication([], applications)).toEqual(["marketer", "admin"]);
  });
});

describe("applicationSchemas", () => {
  const seller = { business_name: "Shop", contact_information: "416-555-0100", city: "Toronto", category: "food", description: "Groceries" };

  it("accepts a complete seller application, and trims it", () => {
    expect(applicationSchemas.seller.parse({ ...seller, city: " Toronto " }).city).toBe("Toronto");
  });

  it("reports missing and overlong details", () => {
    const issue = (input: object) => applicationSchemas.seller.safeParse(input).error?.issues[0]?.message;
    expect(issue({ ...seller, business_name: "  " })).toBe("required");
    expect(issue({ ...seller, business_name: "x".repeat(151) })).toBe("tooLong");
    expect(issue({ ...seller, category: "not-a-category" })).toBe("required");
  });

  it("gives every blank field a message the form can show", () => {
    for (const schema of Object.values(applicationSchemas)) {
      for (const issue of schema.safeParse({}).error?.issues ?? []) {
        expect(["required", "tooLong"]).toContain(issue.message);
      }
    }
  });

  it("does not let a seller choose their own country", () => {
    expect(applicationSchemas.seller.parse({ ...seller, country: "NG" })).not.toHaveProperty("country");
  });

  it("requires a reason for Admin and Marketer", () => {
    expect(applicationSchemas.admin.safeParse({ reason: "" }).success).toBe(false);
    expect(applicationSchemas.marketer.safeParse({ reason: "I can help" }).success).toBe(true);
  });
});

describe("applicationErrorKey", () => {
  it("maps database refusals to messages, without exposing their wording", () => {
    expect(applicationErrorKey({ code: "23505", message: "duplicate key on role_applications_one_pending" })).toBe("alreadyPending");
    expect(applicationErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(applicationErrorKey({ code: "55000", message: "ROLE_ALREADY_HELD" })).toBe("alreadyHeld");
    expect(applicationErrorKey({ code: "23514", message: "SELLER_MUST_BE_IN_CANADA" })).toBe("detailsInvalid");
    expect(applicationErrorKey({ code: "P0002", message: "APPLICATION_NOT_FOUND" })).toBe("notFound");
    expect(applicationErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});

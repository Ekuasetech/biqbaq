import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CATEGORY_SLUGS } from "@/modules/product-catalog/types";

// Seller Staff is not here: a seller invites and approves their own staff (Q-32).
export const APPLICABLE_ROLES = ["seller", "marketer", "admin"] as const;
export type ApplicableRole = (typeof APPLICABLE_ROLES)[number];

export type RoleKey = ApplicableRole | "buyer" | "co_admin" | "super_admin";

export interface UserRole {
  id: string;
  role_key: RoleKey;
  status: "active" | "suspended" | "revoked";
  status_reason: string | null;
}

export interface RoleApplication {
  id: string;
  role_key: RoleKey;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  rejection_reason: string | null;
  created_at: string;
}

// Error values are keys into the account.errors messages. These help people fill in
// the form: the database applies the same required fields, and has the final say.
const required = (max: number) =>
  z.string("required").trim().min(1, "required").max(max, "tooLong");

export const applicationSchemas = {
  seller: z.object({
    business_name: required(150),
    contact_information: required(200),
    city: required(100),
    category: z.enum(CATEGORY_SLUGS, "required"),
    description: required(1000),
  }),
  marketer: z.object({ reason: required(1000) }),
  admin: z.object({ reason: required(1000) }),
} satisfies Record<ApplicableRole, z.ZodType>;

/** The roles someone may still apply for, given what they hold and have open. */
export function rolesOpenForApplication(roles: UserRole[], applications: RoleApplication[]): ApplicableRole[] {
  return APPLICABLE_ROLES.filter(
    (role) =>
      !roles.some((held) => held.role_key === role && held.status !== "revoked") &&
      !applications.some((application) => application.role_key === role && application.status === "pending"),
  );
}

/** Turns a database refusal into a key for the account.errors messages. */
export function applicationErrorKey(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "alreadyPending";
  if (error.code === "42501") return "notAllowed";
  if (error.message === "ROLE_ALREADY_HELD") return "alreadyHeld";
  if (error.message === "APPLICATION_DETAILS_INVALID" || error.message === "SELLER_MUST_BE_IN_CANADA") {
    return "detailsInvalid";
  }
  if (error.code === "P0002") return "notFound";
  return "generic";
}

export async function submitApplication(
  supabase: SupabaseClient,
  role: ApplicableRole,
  details: Record<string, unknown>,
) {
  // Sellers must be based in Canada for now (ADR-0005), so it is not a choice here.
  const withCountry = role === "seller" ? { ...details, country: "CA" } : details;
  return supabase.rpc("submit_role_application", { p_role_key: role, p_details: withCountry });
}

export async function withdrawApplication(supabase: SupabaseClient, applicationId: string) {
  return supabase.rpc("withdraw_role_application", { p_application_id: applicationId });
}

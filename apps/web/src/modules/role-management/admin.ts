import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleApplication } from "./index";

export const ADMIN_PAGE_SIZE = 10;
export const APPLICATION_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;

export interface AdminApplication {
  id: string;
  applicant_id: string;
  applicant_name: string | null;
  applicant_email: string;
  role_key: RoleApplication["role_key"];
  status: RoleApplication["status"];
  details: Record<string, unknown>;
  rejection_reason: string | null;
  reviewer_name: string | null;
  decided_at: string | null;
  created_at: string;
  total: number;
}

export interface AdminApplicationFilters {
  status?: string;
  role?: string;
  search?: string;
  applicant?: string;
  page?: number;
}

// Every function here is also checked by the database. A non-Super Admin who calls
// them is refused, whatever this code or the page does.

export async function listAdminApplications(supabase: SupabaseClient, filters: AdminApplicationFilters) {
  return supabase.rpc("admin_list_role_applications", {
    p_status: filters.status ?? null,
    p_role: filters.role ?? null,
    p_search: filters.search ?? null,
    p_applicant: filters.applicant ?? null,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: ((filters.page ?? 1) - 1) * ADMIN_PAGE_SIZE,
  });
}

export async function listRecentApplications(supabase: SupabaseClient) {
  return supabase.rpc("admin_recent_role_applications", { p_limit: ADMIN_PAGE_SIZE });
}

export async function approveApplication(supabase: SupabaseClient, id: string, permissions: string[]) {
  return supabase.rpc("approve_role_application", { p_application_id: id, p_permissions: permissions });
}

export async function rejectApplication(supabase: SupabaseClient, id: string, reason: string) {
  return supabase.rpc("reject_role_application", { p_application_id: id, p_reason: reason });
}

/** Turns a refused decision into a key for the admin.errors messages. */
export function adminErrorKey(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "notAllowed";
  if (error.code === "55000") return "alreadyDecided";
  if (error.message === "REASON_REQUIRED") return "reasonRequired";
  return "generic";
}

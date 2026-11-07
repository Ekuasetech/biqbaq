import type { SupabaseClient } from "@supabase/supabase-js";

export const PEOPLE_PAGE_SIZE = 10;
export const REASON_MAX_LENGTH = 500;
export const ASSIGNABLE_ROLES = ["admin", "co_admin", "marketer", "super_admin"] as const;
export const ROLE_FILTERS = ["all", "super_admin", "admin", "co_admin", "seller", "seller_staff", "marketer"] as const;
export type RoleStatus = "active" | "suspended" | "revoked";

export interface PersonRole {
  id: string;
  role_key: string;
  status: RoleStatus;
  status_reason: string | null;
  permissions: string[];
}

export interface Person {
  id: string;
  display_name: string | null;
  email: string;
  account_status: string;
  roles: PersonRole[];
  total: number;
}

// Every function here is also checked by the database, whatever this code or the page does.

export const listPeople = (supabase: SupabaseClient, search: string, role: string, page: number) =>
  supabase.rpc("admin_list_people", {
    p_search: search || null,
    p_role: role === "all" ? null : role,
    p_limit: PEOPLE_PAGE_SIZE,
    p_offset: (page - 1) * PEOPLE_PAGE_SIZE,
  });

export const assignRole = (supabase: SupabaseClient, userId: string, role: string, reason: string, permissions: string[]) =>
  supabase.rpc("assign_role", { p_user_id: userId, p_role_key: role, p_reason: reason, p_permissions: permissions });

export const setRoleStatus = (supabase: SupabaseClient, roleId: string, status: RoleStatus, reason: string) =>
  supabase.rpc("set_role_status", { p_user_role_id: roleId, p_status: status, p_reason: reason });

/** Which permissions need adding and removing to get from the current set to the chosen one. */
export function permissionChanges(current: string[], chosen: string[]) {
  return {
    grant: chosen.filter((key) => !current.includes(key)),
    revoke: current.filter((key) => !chosen.includes(key)),
  };
}

export async function savePermissions(supabase: SupabaseClient, roleId: string, current: string[], chosen: string[]) {
  const { grant, revoke } = permissionChanges(current, chosen);
  for (const key of grant) {
    const { error } = await supabase.rpc("grant_permission", { p_user_role_id: roleId, p_permission: key });
    if (error) return { error };
  }
  for (const key of revoke) {
    const { error } = await supabase.rpc("revoke_permission", { p_user_role_id: roleId, p_permission: key });
    if (error) return { error };
  }
  return { error: null };
}

/** What Super Admin may do to a role, matching the database. Buyer comes with every account. */
export function roleActions(role: Pick<PersonRole, "role_key" | "status">): ("suspend" | "restore" | "revoke" | "permissions")[] {
  if (role.role_key === "buyer" || role.status === "revoked") return [];
  const hasPermissions = role.role_key === "admin" || role.role_key === "co_admin";
  return [
    ...(hasPermissions ? (["permissions"] as const) : []),
    role.status === "active" ? ("suspend" as const) : ("restore" as const),
    "revoke" as const,
  ];
}

/** The roles a person could be given now. A removed role can be given again. */
export const assignableRolesFor = (roles: Pick<PersonRole, "role_key" | "status">[]) =>
  ASSIGNABLE_ROLES.filter((key) => !roles.some((role) => role.role_key === key && role.status !== "revoked"));

/** Maps a refusal to a message, without showing the database's wording. */
export function roleErrorKey(error: { code?: string; message?: string }): string {
  if (error.message === "REASON_REQUIRED") return "reasonRequired";
  if (error.message === "REASON_TOO_LONG") return "reasonTooLong";
  if (error.message === "LAST_SUPER_ADMIN") return "lastSuperAdmin";
  if (error.code === "42501") return "notAllowed";
  if (error.code === "55000" || error.code === "P0002") return "changed";
  return "generic";
}

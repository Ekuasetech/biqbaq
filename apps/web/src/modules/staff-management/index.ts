import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Only what works today. Conversations, orders and analytics join when those features exist.
export const STAFF_PERMISSIONS = [
  "products.create",
  "products.edit",
  "products.publish",
  "products.delete",
  "messages.view",
  "messages.respond",
  "staff.manage",
] as const;

/** Message keys cannot contain dots. */
export const permissionMessageKey = (key: string) => key.replaceAll(".", "_");

export const inviteSchema = z.object({ email: z.email("emailInvalid").max(254, "emailInvalid") });

export interface ShopAccess {
  is_owner: boolean;
  permissions: string[];
}

export interface StaffMember {
  membership_id: string;
  display_name: string | null;
  email: string;
  status: "pending" | "active" | "suspended";
  role_active: boolean;
  permissions: string[];
}

export interface StaffInvitation {
  id: string;
  email: string;
  permissions: string[];
  expires_at: string;
}

export interface MyInvitation {
  id: string;
  shop_name: string;
  permissions: string[];
  expires_at: string;
}

export interface MyStaffShop {
  membership_id: string;
  seller_id: string;
  shop_name: string;
  status: "pending" | "active" | "suspended";
  shop_active: boolean;
  role_active: boolean;
  permissions: string[];
}

// Every function here is also checked by the database, whatever this code or the page does.

export async function getShopAccess(supabase: SupabaseClient, sellerId: string) {
  const { data, error } = await supabase.rpc("shop_access", { p_seller: sellerId });
  return { access: ((data ?? []) as ShopAccess[])[0] ?? null, error };
}

export const can = (access: ShopAccess | null, permission: string) => Boolean(access?.permissions.includes(permission));

/** Whether a staff member can actually work in this shop now, and if not, what is holding it up. */
export function staffShopState(shop: Pick<MyStaffShop, "status" | "shop_active" | "role_active">): "ready" | "awaitingSeller" | "roleBlocked" | "suspended" | "shopSuspended" {
  if (!shop.shop_active) return "shopSuspended";
  if (shop.status === "pending") return "awaitingSeller";
  if (shop.status !== "active") return "suspended";
  return shop.role_active ? "ready" : "roleBlocked";
}

export const getSellerAllowance = (supabase: SupabaseClient, sellerId: string) => supabase.rpc("shop_publishing_allowance", { p_seller: sellerId });
export const listStaff = (supabase: SupabaseClient, sellerId: string) => supabase.rpc("shop_staff", { p_seller: sellerId });
export const listInvitations = (supabase: SupabaseClient, sellerId: string) => supabase.rpc("shop_invitations", { p_seller: sellerId });
export const inviteStaff = (supabase: SupabaseClient, sellerId: string, email: string, permissions: string[]) =>
  supabase.rpc("invite_staff", { p_seller: sellerId, p_email: email, p_permissions: permissions });
export const cancelInvitation = (supabase: SupabaseClient, id: string) => supabase.rpc("cancel_staff_invitation", { p_invitation: id });
export const setStaffPermissions = (supabase: SupabaseClient, id: string, permissions: string[]) =>
  supabase.rpc("set_staff_permissions", { p_membership: id, p_permissions: permissions });
export const approveStaff = (supabase: SupabaseClient, id: string) => supabase.rpc("approve_staff_member", { p_membership: id });
export const setStaffStatus = (supabase: SupabaseClient, id: string, status: "active" | "suspended" | "removed") =>
  supabase.rpc("set_staff_status", { p_membership: id, p_status: status });
export const listMyInvitations = (supabase: SupabaseClient) => supabase.rpc("my_staff_invitations");
export const listMyStaffShops = (supabase: SupabaseClient) => supabase.rpc("my_staff_shops");
export const acceptInvitation = (supabase: SupabaseClient, id: string) => supabase.rpc("accept_staff_invitation", { p_invitation: id });
export const declineInvitation = (supabase: SupabaseClient, id: string) => supabase.rpc("decline_staff_invitation", { p_invitation: id });
export const leaveShop = (supabase: SupabaseClient, id: string) => supabase.rpc("leave_staff_shop", { p_membership: id });

/** Maps a refusal to a message, without showing the database's wording. */
export function staffErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    EMAIL_INVALID: "emailInvalid",
    CANNOT_INVITE_OWNER: "inviteOwner",
    ALREADY_STAFF: "alreadyStaff",
    INVITATION_PENDING: "invitationPending",
    RATE_LIMITED: "rateLimited",
    CANNOT_CHANGE_OWN_ACCESS: "ownAccess",
    STAFF_ROLE_BLOCKED: "roleBlocked",
  };
  if (error.message && known[error.message]) return known[error.message];
  if (error.code === "42501") return "notAllowed";
  if (error.code === "55000" || error.code === "P0002") return "changed";
  return "generic";
}

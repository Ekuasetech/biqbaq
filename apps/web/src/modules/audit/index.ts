import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIT_PAGE_SIZE = 25;

// Every action the database records. A new one still shows, under its own name, until it is added.
export const AUDIT_ACTIONS = [
  "role_application.submit",
  "role_application.withdraw",
  "role_application.approve",
  "role_application.reject",
  "role.assign",
  "role.bootstrap",
  "role.active",
  "role.suspended",
  "role.revoked",
  "permission.grant",
  "permission.revoke",
  "seller.profile_update",
  "seller.verification_change",
  "seller.active",
  "seller.suspended",
  "seller.publishing_suspend",
  "seller.publishing_restore",
  "seller.allowance_override",
  "product.create",
  "product.edit",
  "product.publish",
  "product.unpublish",
  "product.delete",
  "product.suspend",
  "product.restore",
  "product.image_add",
  "product.image_remove",
  "product.image_primary",
  "staff.invite",
  "staff.invite_cancel",
  "staff.invite_accept",
  "staff.invite_decline",
  "staff.approve",
  "staff.permissions",
  "staff.active",
  "staff.suspended",
  "staff.removed",
  "staff.leave",
  "review.hide",
  "review.restore",
  "blog.create",
  "blog.edit",
  "blog.cover",
  "blog.publish",
  "blog.schedule",
  "blog.unpublish",
  "blog.archive",
  "blog.category_create",
  "comment.hide",
  "comment.restore",
  "ad.create",
  "ad.edit",
  "ad.image",
  "ad.activate",
  "ad.deactivate",
  "ad.delete",
  "vehicle.create",
  "vehicle.edit",
  "vehicle.publish",
  "vehicle.unpublish",
  "vehicle.delete",
  "vehicle.image_add",
  "vehicle.image_remove",
  "vehicle.suspend",
  "vehicle.restore",
  "setting.update",
] as const;

/** Message keys cannot contain dots. */
export const auditActionMessageKey = (action: string) => action.replaceAll(".", "_");

export interface AuditEntry {
  id: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  on_behalf_of_seller: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  total: number;
}

export const listAuditLog = (supabase: SupabaseClient, action: string, search: string, page: number) =>
  supabase.rpc("admin_audit_log", {
    p_action: action || null,
    p_search: search || null,
    p_limit: AUDIT_PAGE_SIZE,
    p_offset: (page - 1) * AUDIT_PAGE_SIZE,
  });

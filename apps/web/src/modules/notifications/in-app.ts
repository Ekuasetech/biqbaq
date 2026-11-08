import type { SupabaseClient } from "@supabase/supabase-js";

// The bell (Q-38). Each notification's type is the email template that announced the same
// event, so both say the same thing and lead to the same place.

export interface AppNotification {
  id: string;
  type: string;
  data: { role?: string; shop?: string; product?: string; reason?: string };
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  category: EmailCategory;
  email_enabled: boolean;
}

/** The emails people may turn off (Q-39). Decisions about their account always email. */
export const EMAIL_CATEGORIES = ["messages", "staff"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/** Where each notification leads. Matches its email's link (checked by a test). */
export const NOTIFICATION_PATHS: Record<string, string> = {
  welcome: "/account",
  application_received: "/admin/role-applications",
  application_approved: "/account",
  application_rejected: "/account",
  verification_verified: "/account/shop",
  verification_rejected: "/account/shop",
  verification_suspended: "/account/shop",
  verification_restored: "/account/shop",
  verification_revoked: "/account/shop",
  product_suspended: "/account/shop",
  product_restored: "/account/shop",
  shop_suspended: "/account/shop",
  shop_restored: "/account/shop",
  publishing_suspended: "/account/shop",
  publishing_restored: "/account/shop",
  role_assigned: "/account",
  role_suspended: "/account",
  role_restored: "/account",
  role_revoked: "/account",
  staff_invitation: "/account",
  staff_approved: "/account",
  staff_suspended: "/account",
  staff_restored: "/account",
  staff_removed: "/account",
};

export const notificationPath = (type: string) => NOTIFICATION_PATHS[type] ?? "/account";

export const NOTIFICATIONS_PAGE_SIZE = 20;

export const listNotifications = (supabase: SupabaseClient, before?: string) =>
  supabase.rpc("my_notifications", { p_before: before ?? null, p_limit: NOTIFICATIONS_PAGE_SIZE });
export const unreadNotificationCount = (supabase: SupabaseClient) => supabase.rpc("unread_notification_count");
export const markNotificationsRead = (supabase: SupabaseClient, ids?: string[]) =>
  supabase.rpc("mark_notifications_read", { p_ids: ids ?? null });
export const listPreferences = (supabase: SupabaseClient) => supabase.rpc("my_notification_preferences");
export const setPreference = (supabase: SupabaseClient, category: EmailCategory, enabled: boolean) =>
  supabase.rpc("set_notification_preference", { p_category: category, p_email_enabled: enabled });

/** Window event sent after reading, so the header's count updates at once. */
export const NOTIFICATIONS_CHANGED = "biqbaq:notifications-changed";

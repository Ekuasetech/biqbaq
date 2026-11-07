import type { SupabaseClient } from "@supabase/supabase-js";

export const MODERATION_PAGE_SIZE = 10;
export const REASON_MAX_LENGTH = 500;
export const PRODUCT_FILTERS = ["published", "suspended", "unpublished", "all"] as const;
export const SHOP_FILTERS = ["all", "suspended", "publishing_suspended"] as const;

export interface ModerationAccess {
  products: boolean;
  shops: boolean;
  publishing: boolean;
}

export const NO_ACCESS: ModerationAccess = { products: false, shops: false, publishing: false };

export interface ModerationProduct {
  id: string;
  slug: string;
  name: string;
  status: "published" | "unpublished" | "archived" | "suspended";
  price_minor: number;
  currency: "CAD" | "NGN";
  seller_name: string;
  seller_slug: string;
  seller_active: boolean;
  total: number;
}

export interface ModerationShop {
  id: string;
  slug: string;
  name: string;
  city: string;
  status: "active" | "suspended";
  publishing_suspended: boolean;
  verification_status: string;
  owner_email: string | null;
  product_count: number;
  total: number;
}

// Every function here is also checked by the database, whatever this code or the page does.

export async function getModerationAccess(supabase: SupabaseClient): Promise<ModerationAccess> {
  const { data, error } = await supabase.rpc("my_moderation_access");
  return error ? NO_ACCESS : ((data as ModerationAccess[])[0] ?? NO_ACCESS);
}

export const hasAnyAccess = (access: ModerationAccess) => access.products || access.shops || access.publishing;

export const listProducts = (supabase: SupabaseClient, filter: string, search: string, page: number) =>
  supabase.rpc("admin_list_moderation_products", {
    p_status: filter === "all" ? null : filter,
    p_search: search || null,
    p_limit: MODERATION_PAGE_SIZE,
    p_offset: (page - 1) * MODERATION_PAGE_SIZE,
  });

export const listShops = (supabase: SupabaseClient, filter: string, search: string, page: number) =>
  supabase.rpc("admin_list_moderation_sellers", {
    p_filter: filter === "all" ? null : filter,
    p_search: search || null,
    p_limit: MODERATION_PAGE_SIZE,
    p_offset: (page - 1) * MODERATION_PAGE_SIZE,
  });

export const suspendProduct = (supabase: SupabaseClient, id: string, reason: string) =>
  supabase.rpc("suspend_product", { p_product_id: id, p_reason: reason });
export const restoreProduct = (supabase: SupabaseClient, id: string, reason: string) =>
  supabase.rpc("restore_product", { p_product_id: id, p_reason: reason });
export const setShopStatus = (supabase: SupabaseClient, id: string, status: "active" | "suspended", reason: string) =>
  supabase.rpc("set_seller_status", { p_seller_id: id, p_status: status, p_reason: reason });
export const setShopPublishing = (supabase: SupabaseClient, id: string, suspended: boolean, reason: string) =>
  supabase.rpc("set_seller_publishing", { p_seller_id: id, p_suspended: suspended, p_reason: reason });

/** Maps a refusal to a message, without showing the database's wording. */
export function moderationErrorKey(error: { code?: string; message?: string }): string {
  if (error.message === "REASON_REQUIRED") return "reasonRequired";
  if (error.message === "REASON_TOO_LONG") return "reasonTooLong";
  if (error.message === "CANNOT_MODERATE_OWN") return "ownShop";
  if (error.code === "42501") return "notAllowed";
  if (error.code === "55000" || error.code === "P0002") return "changed";
  return "generic";
}

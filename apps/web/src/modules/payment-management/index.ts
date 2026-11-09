import type { SupabaseClient } from "@supabase/supabase-js";

// Online payments (PRD §13, BD-02, BD-03, BD-12). Provider-independent here; the provider
// itself is only ever spoken to from the server (stripe.ts). The database checks every rule.

export const PAYMENT_STATUSES = ["disabled", "onboarding_incomplete", "verification_pending", "restricted", "enabled", "suspended"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentAccount {
  enabled_by_admin: boolean;
  status: PaymentStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: number;
  has_account: boolean;
  checked_at: string | null;
  application_fee_minor: number;
}

export interface ShopOrder {
  id: string;
  number: string;
  product_name: string;
  quantity: number;
  total_minor: number;
  application_fee_minor: number;
  status: string;
  refunded_minor: number;
  disputed: boolean;
  fulfilled_at: string | null;
  buyer_email: string | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: ShippingAddress | null;
  paid_at: string | null;
  created_at: string;
  total: number;
}

export interface MyOrder {
  id: string;
  number: string;
  shop_name: string;
  shop_slug: string;
  product_name: string;
  product_slug: string | null;
  quantity: number;
  total_minor: number;
  status: "paid" | "pending";
  refunded_minor: number;
  fulfilled_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface AdminPaymentAccount {
  seller_id: string;
  shop_name: string;
  shop_slug: string;
  enabled_by_admin: boolean;
  status: PaymentStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  has_account: boolean;
  paid_orders: number;
  paid_minor: number;
  checked_at: string | null;
  total: number;
}

export interface AdminOrder {
  id: string;
  number: string;
  shop_name: string;
  buyer_email: string | null;
  product_name: string;
  total_minor: number;
  application_fee_minor: number;
  status: string;
  refunded_minor: number;
  disputed: boolean;
  provider_payment_id: string | null;
  created_at: string;
  total: number;
}

export interface ShippingAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

/** An address on separate lines, leaving out what is missing. */
export const addressLines = (address: ShippingAddress | null) =>
  address
    ? [address.line1, address.line2, [address.city, address.state, address.postal_code].filter(Boolean).join(" "), address.country]
        .map((part) => (part ?? "").trim())
        .filter(Boolean)
    : [];

/** Where an order stands, for the seller and the buyer. */
export function orderState(order: { status: string; refunded_minor: number; total_minor: number; fulfilled_at: string | null; disputed?: boolean }) {
  if (order.status !== "paid") return order.status as "pending" | "failed" | "expired";
  if (order.disputed) return "disputed";
  if (order.refunded_minor >= order.total_minor) return "refunded";
  if (order.refunded_minor > 0) return "partly_refunded";
  return order.fulfilled_at ? "delivered" : "to_deliver";
}

export const myPaymentAccount = (supabase: SupabaseClient, seller: string) => supabase.rpc("my_payment_account", { p_seller: seller });
export const listShopOrders = (supabase: SupabaseClient, seller: string, status: string, page: number) =>
  supabase.rpc("list_shop_orders", { p_seller: seller, p_status: status === "all" ? null : status, p_limit: 50, p_offset: (page - 1) * 50 });
export const setOrderFulfilled = (supabase: SupabaseClient, order: string, fulfilled: boolean) =>
  supabase.rpc("set_order_fulfilled", { p_order: order, p_fulfilled: fulfilled });
export const listMyOrders = (supabase: SupabaseClient) => supabase.rpc("my_orders", { p_limit: 100 });
export const adminListPaymentAccounts = (supabase: SupabaseClient, search: string, page: number) =>
  supabase.rpc("admin_list_payment_accounts", { p_search: search || null, p_limit: 20, p_offset: (page - 1) * 20 });
export const adminSetSellerPayments = (supabase: SupabaseClient, seller: string, enabled: boolean) =>
  supabase.rpc("admin_set_seller_payments", { p_seller: seller, p_enabled: enabled });
export const adminListOrders = (supabase: SupabaseClient, search: string, page: number) =>
  supabase.rpc("admin_list_orders", { p_search: search || null, p_limit: 20, p_offset: (page - 1) * 20 });

/** Maps a refusal to a message key under payments.errors, without showing the provider's or database's wording. */
export function paymentErrorKey(code: string | undefined): string {
  const known = new Set([
    "QUANTITY_INVALID",
    "PRODUCT_NOT_FOUND",
    "OUT_OF_STOCK",
    "PAYMENTS_UNAVAILABLE",
    "OWN_SHOP",
    "TOTAL_TOO_SMALL",
    "RATE_LIMITED",
    "AMOUNT_INVALID",
    "ORDER_NOT_PAID",
    "NOT_ALLOWED",
    "SIGN_IN",
    "NOT_CONFIGURED",
    "PROVIDER_FAILED",
  ]);
  return code && known.has(code) ? code : "GENERIC";
}

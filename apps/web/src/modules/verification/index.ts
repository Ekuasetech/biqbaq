import type { SupabaseClient } from "@supabase/supabase-js";

export const VERIFICATION_STATUSES = ["unverified", "pending", "provider_verified", "manually_verified", "rejected", "suspended", "expired"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** The filters on the Super Admin screen, in the order they are worked through. */
export const REVIEW_FILTERS = ["pending", "manually_verified", "provider_verified", "suspended", "rejected", "unverified", "all"] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export const REVIEW_PAGE_SIZE = 10;
export const NOTE_MAX_LENGTH = 1000;

export type VerificationAction = "verify" | "suspend" | "restore" | "revoke";

export interface MyVerificationRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface SellerForReview {
  seller_id: string;
  seller_slug: string;
  seller_name: string;
  seller_city: string;
  seller_status: "active" | "suspended";
  publishing_suspended: boolean;
  verification_status: VerificationStatus;
  owner_name: string | null;
  owner_email: string;
  contact_information: string | null;
  description: string;
  product_count: number;
  request_id: string | null;
  request_note: string | null;
  request_created_at: string | null;
  total: number;
}

export interface VerificationEvent {
  id: string;
  from_status: VerificationStatus;
  to_status: VerificationStatus;
  method: "manual" | "provider" | null;
  actor_name: string | null;
  reason: string | null;
  created_at: string;
}

// Every function here is also checked by the database, whatever this code or the page does.

export const isVerified = (status: VerificationStatus) => status === "provider_verified" || status === "manually_verified";

/** Whether a seller may ask, which matches the database's rule. */
export const canRequest = (status: VerificationStatus) => status === "unverified" || status === "rejected" || status === "expired";

/** What Super Admin may do from each status, which matches the database's rule. */
export function actionsFor(status: VerificationStatus): VerificationAction[] {
  if (isVerified(status)) return ["suspend", "revoke"];
  if (status === "suspended") return ["restore", "revoke"];
  // An open request is decided with Approve or Reject instead.
  return status === "pending" ? [] : ["verify"];
}

export async function getMyLatestRequest(supabase: SupabaseClient, sellerId: string) {
  return supabase
    .from("verification_requests")
    .select("id, status, reason, created_at, decided_at")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export const requestVerification = (supabase: SupabaseClient, note: string) =>
  supabase.rpc("request_manual_verification", { p_note: note });

export async function listForReview(supabase: SupabaseClient, filter: ReviewFilter, search: string, page: number) {
  return supabase.rpc("admin_list_seller_verification", {
    p_status: filter === "all" ? null : filter,
    p_search: search || null,
    p_limit: REVIEW_PAGE_SIZE,
    p_offset: (page - 1) * REVIEW_PAGE_SIZE,
  });
}

export const loadHistory = (supabase: SupabaseClient, sellerId: string) =>
  supabase.rpc("admin_verification_history", { p_seller_id: sellerId });

export const decide = (supabase: SupabaseClient, requestId: string, approve: boolean, reason?: string) =>
  supabase.rpc("decide_manual_verification", { p_request_id: requestId, p_approve: approve, p_reason: reason ?? null });

export const changeStatus = (supabase: SupabaseClient, sellerId: string, action: VerificationAction, reason: string) =>
  supabase.rpc("set_verification_status", { p_seller_id: sellerId, p_action: action, p_reason: reason });

/** Maps a refusal to a message, without showing the database's wording. */
export function verificationErrorKey(error: { code?: string; message?: string }): string {
  if (error.message === "REASON_REQUIRED") return "reasonRequired";
  if (error.message === "NOTE_REQUIRED") return "noteRequired";
  if (error.code === "42501") return "notAllowed";
  if (error.code === "55000") return "changed";
  return "generic";
}

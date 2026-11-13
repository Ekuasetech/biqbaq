import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Reviews of a shop from its buyers, by invitation (owner's request, 2026-11-13, Q-67). The
 * seller makes a one-time link for each buyer; the buyer, with or without an account, leaves a
 * name, stars and words, which show at once on the seller's page. The database checks it all.
 */
export const SHOP_REVIEW_BODY_MAX = 2000;
export const SHOP_REVIEW_NAME_MAX = 80;
export const REVIEW_INVITES_PAGE_SIZE = 20;

export type InviteState = "waiting" | "reviewed" | "expired" | "cancelled";

export interface ReviewInvite {
  id: string;
  token: string;
  buyer_name: string;
  created_at: string;
  expires_at: string;
  state: InviteState;
  rating: number | null;
  total: number;
}

export interface SellerReview {
  id: string;
  reviewer_name: string;
  rating: number;
  body: string;
  created_at: string;
}

/** The page a buyer opens to leave their review. */
export const reviewInviteUrl = (siteUrl: string, token: string, locale: string) =>
  `${siteUrl.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}/review/${encodeURIComponent(token)}`;

export const reviewTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const invitedReviewSchema = z.object({
  name: z.string().trim().min(1).max(SHOP_REVIEW_NAME_MAX),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(SHOP_REVIEW_BODY_MAX).default(""),
  /** Left empty by people; robots fill it in. */
  website: z.string().optional(),
});

export const createReviewInvite = (supabase: SupabaseClient, seller: string, buyerName: string) =>
  supabase.rpc("create_review_invite", { p_seller: seller, p_buyer_name: buyerName });
export const listReviewInvites = (supabase: SupabaseClient, seller: string, page: number) =>
  supabase.rpc("list_review_invites", { p_seller: seller, p_limit: REVIEW_INVITES_PAGE_SIZE, p_offset: (Math.max(page, 1) - 1) * REVIEW_INVITES_PAGE_SIZE });
export const cancelReviewInvite = (supabase: SupabaseClient, invite: string) => supabase.rpc("cancel_review_invite", { p_invite: invite });

/** A shop's published reviews and their summary, from the public view. */
export async function listSellerReviews(supabase: SupabaseClient, sellerSlug: string, limit = 20) {
  const [page, all] = await Promise.all([
    supabase
      .from("public_seller_reviews")
      .select("id, reviewer_name, rating, body, created_at", { count: "exact" })
      .eq("seller_slug", sellerSlug)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(limit),
    supabase.from("public_seller_reviews").select("rating").eq("seller_slug", sellerSlug),
  ]);
  if (page.error || all.error) return null;
  const ratings = (all.data ?? []) as { rating: number }[];
  const average = ratings.length ? Math.round((ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length) * 10) / 10 : null;
  return { reviews: (page.data ?? []) as SellerReview[], count: page.count ?? ratings.length, average };
}

const ERRORS = new Set(["DETAILS_INVALID", "TOO_MANY_INVITES", "REVIEWS_OFF", "INVITE_USED", "INVITE_EXPIRED", "INVITE_NOT_FOUND", "RATE_LIMITED"]);
export const shopReviewErrorKey = (code: string | undefined) => (code && ERRORS.has(code) ? code : "GENERIC");

export interface ShopReviewForModeration {
  id: string;
  shop_name: string;
  shop_slug: string;
  reviewer_name: string;
  rating: number;
  body: string;
  status: "published" | "hidden";
  hidden_reason: string | null;
  created_at: string;
  total: number;
}

export const listShopReviewsForModeration = (supabase: SupabaseClient, status: string, search: string, page: number, pageSize: number) =>
  supabase.rpc("admin_list_shop_reviews", { p_status: status === "all" ? null : status, p_search: search || null, p_limit: pageSize, p_offset: (page - 1) * pageSize });
export const setShopReviewHidden = (supabase: SupabaseClient, id: string, hidden: boolean, reason: string) =>
  supabase.rpc("set_shop_review_hidden", { p_review: id, p_hidden: hidden, p_reason: reason });

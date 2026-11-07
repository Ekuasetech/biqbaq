import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const REVIEW_MAX_LENGTH = 2000;

// Error values are keys into the reviews.errors messages. The database applies the same rules.
export const reviewSchema = z.object({
  rating: z.coerce.number("ratingRequired").int("ratingRequired").min(1, "ratingRequired").max(5, "ratingRequired"),
  body: z.string().trim().max(REVIEW_MAX_LENGTH, "tooLong").default(""),
});

export type ReviewBlocker = "signed_out" | "disabled" | "not_public" | "own_shop" | "account";

export interface ReviewState {
  can_review: boolean;
  reason: ReviewBlocker | null;
  rating: number | null;
  body: string | null;
  status: "published" | "hidden" | null;
}

export interface Favourite {
  product_id: string;
  slug: string | null;
  name: string | null;
  price_minor: number | null;
  currency: string | null;
  image_url: string | null;
  available: boolean;
  saved_at: string;
}

export interface ReviewForModeration {
  id: string;
  product_name: string;
  product_slug: string;
  seller_name: string;
  author_name: string | null;
  author_email: string | null;
  rating: number;
  body: string;
  status: "published" | "hidden";
  hidden_reason: string | null;
  created_at: string;
  total: number;
}

// Every function here is also checked by the database, whatever this code or the page does.

export async function getReviewState(supabase: SupabaseClient, productId: string) {
  const { data, error } = await supabase.rpc("my_review_state", { p_product: productId });
  return { state: ((data ?? []) as ReviewState[])[0] ?? null, error };
}

export const saveReview = (supabase: SupabaseClient, productId: string, rating: number, body: string) =>
  supabase.rpc("save_review", { p_product: productId, p_rating: rating, p_body: body });
export const deleteMyReview = (supabase: SupabaseClient, productId: string) => supabase.rpc("delete_my_review", { p_product: productId });
export const isFavourite = (supabase: SupabaseClient, productId: string) => supabase.rpc("is_favourite", { p_product: productId });
export const setFavourite = (supabase: SupabaseClient, productId: string, saved: boolean) =>
  supabase.rpc("set_favourite", { p_product: productId, p_saved: saved });
export const listMyFavourites = (supabase: SupabaseClient) => supabase.rpc("my_favourites");
export const listReviewsForModeration = (supabase: SupabaseClient, status: string, search: string, page: number, pageSize: number) =>
  supabase.rpc("admin_list_reviews", {
    p_status: status === "all" ? null : status,
    p_search: search || null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
export const setReviewHidden = (supabase: SupabaseClient, id: string, hidden: boolean, reason: string) =>
  supabase.rpc("set_review_hidden", { p_review: id, p_hidden: hidden, p_reason: reason });

/** Maps a refusal to a message, without showing the database's wording. */
export function reviewErrorKey(error: { code?: string; message?: string }): string {
  const known: Record<string, string> = {
    RATING_INVALID: "ratingRequired",
    REVIEW_TOO_LONG: "tooLong",
    CANNOT_REVIEW_OWN: "ownShop",
    REVIEW_HIDDEN: "hidden",
    REVIEWS_DISABLED: "disabled",
    FAVOURITES_DISABLED: "disabled",
    RATE_LIMITED: "rateLimited",
    PRODUCT_NOT_FOUND: "unavailable",
  };
  return (error.message && known[error.message]) || "generic";
}

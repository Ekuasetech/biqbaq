import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import {
  reviewSummary,
  toApiProduct,
  toApiReview,
  type ApiProduct,
  type ApiQuery,
  type ApiReview,
  type PublicProductRow,
  type PublicReviewRow,
  type ReviewsQuery,
} from "./contract";

export interface Storefront {
  seller: { name: string; slug: string; city: string; verified: boolean };
  products: ApiProduct[];
  total: number;
}

const COLUMNS =
  "id, slug, name, description, price_minor, currency, availability, images, category_slug, category_name_en, category_name_fr, first_published_at";

/**
 * Reads only the public views, as a signed-out visitor, so it can never return more than the
 * site already shows. Cached with the catalogue, so a seller's change clears it.
 * Null means no public seller has this address, including a suspended one.
 */
export async function getStorefront(sellerSlug: string, query: ApiQuery, siteUrl: string): Promise<Storefront | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);

  const supabase = getSupabasePublicClient();
  const { data: seller, error: sellerError } = await supabase
    .from("public_sellers")
    .select("name, slug, city, verified")
    .eq("slug", sellerSlug)
    .maybeSingle();
  if (sellerError) throw new Error(`Seller lookup failed: ${sellerError.code}`);
  if (!seller) return null;

  let products = supabase.from("public_products").select(COLUMNS, { count: "exact" }).eq("seller_slug", sellerSlug);
  if (query.category) products = products.eq("category_slug", query.category);
  if (query.availability) products = products.eq("availability", query.availability);
  products =
    query.sort === "price_asc"
      ? products.order("currency").order("price_minor", { ascending: true })
      : query.sort === "price_desc"
        ? products.order("currency").order("price_minor", { ascending: false })
        : query.sort === "name"
          ? products.order("name")
          : products.order("first_published_at", { ascending: false, nullsFirst: false });
  // A last, unique key, so pages never repeat or skip a product.
  products = products.order("id");

  const from = (query.page - 1) * query.pageSize;
  const { data, count, error } = await products.range(from, from + query.pageSize - 1);
  // Asking for a page past the end is not an error; it is just empty.
  if (error && error.code !== "PGRST103") throw new Error(`Product lookup failed: ${error.code}`);

  return {
    seller: { name: seller.name, slug: seller.slug, city: seller.city, verified: seller.verified },
    products: ((data ?? []) as PublicProductRow[]).map((row) => toApiProduct(row, siteUrl, query.locale)),
    total: count ?? 0,
  };
}

export interface ShopReviews {
  seller: { name: string; slug: string; city: string; verified: boolean };
  summary: { reviewCount: number; averageRating: number | null };
  reviews: ApiReview[];
}

/**
 * A shop's published reviews, newest first, from the public views only, so it can never show
 * more than product pages do. Empty while Super Admin has reviews switched off. Null means no
 * public seller has this address.
 */
export async function getShopReviews(sellerSlug: string, query: ReviewsQuery, siteUrl: string): Promise<ShopReviews | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);

  const supabase = getSupabasePublicClient();
  const { data: seller, error: sellerError } = await supabase
    .from("public_sellers")
    .select("name, slug, city, verified")
    .eq("slug", sellerSlug)
    .maybeSingle();
  if (sellerError) throw new Error(`Seller lookup failed: ${sellerError.code}`);
  if (!seller) return null;

  // Product reviews and shop reviews from invited buyers (Q-67), from one public view.
  let stats = supabase.from("public_api_review_stats").select("review_count, rating_total").eq("seller_slug", sellerSlug);
  let reviews = supabase
    .from("public_api_reviews")
    .select("id, kind, rating, body, is_verified_purchase, created_at, author_name, product_slug, product_name")
    .eq("seller_slug", sellerSlug);
  const kind = query.product ? "product" : query.type;
  if (kind !== "all") {
    stats = stats.eq("kind", kind);
    reviews = reviews.eq("kind", kind);
  }
  if (query.product) {
    stats = stats.eq("product_slug", query.product);
    reviews = reviews.eq("product_slug", query.product);
  }
  const from = (query.page - 1) * query.pageSize;
  const [summary, page] = await Promise.all([
    stats,
    reviews.order("created_at", { ascending: false }).order("id").range(from, from + query.pageSize - 1),
  ]);
  if (summary.error) throw new Error(`Review summary failed: ${summary.error.code}`);
  // Asking for a page past the end is not an error; it is just empty.
  if (page.error && page.error.code !== "PGRST103") throw new Error(`Review lookup failed: ${page.error.code}`);

  return {
    seller: { name: seller.name, slug: seller.slug, city: seller.city, verified: seller.verified },
    summary: reviewSummary((summary.data ?? []) as { review_count: number; rating_total: number }[]),
    reviews: ((page.data ?? []) as PublicReviewRow[]).map((row) => toApiReview(row, siteUrl, query.locale)),
  };
}

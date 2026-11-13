import { createHash } from "node:crypto";
import { z } from "zod";

// The public contract (PRD §10). Additions are fine in v1; anything that changes or removes
// a field needs /api/v2, because independent websites depend on it.

export const API_SORTS = ["newest", "price_asc", "price_desc", "name"] as const;
export const API_AVAILABILITIES = ["in_stock", "limited", "out_of_stock"] as const;
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 1000;

export const apiQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  category: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
  availability: z.enum(API_AVAILABILITIES).optional(),
  sort: z.enum(API_SORTS).default("newest"),
  locale: z.enum(["en", "fr"]).default("en"),
});
export type ApiQuery = z.infer<typeof apiQuerySchema>;

export const sellerSlugSchema = z.string().regex(/^[a-z0-9-]{1,120}$/);

/** Reads the query string, treating an empty value as absent. */
export function parseApiQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const key of ["page", "pageSize", "category", "availability", "sort", "locale"]) {
    const value = params.get(key);
    if (value !== null && value !== "") raw[key] = value;
  }
  return apiQuerySchema.safeParse(raw);
}

export interface PublicProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  availability: string;
  images: unknown;
  category_slug: string | null;
  category_name_en: string | null;
  category_name_fr: string | null;
  first_published_at: string | null;
}

export interface ApiProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: { amountMinor: number; currency: string };
  images: { url: string; alt: string | null }[];
  availability: string;
  category: { slug: string; name: string } | null;
  url: string;
  publishedAt: string | null;
}

/** The product's page on Biqbaq, where clicks from a seller's own website must go (§10.5). */
export function canonicalProductUrl(siteUrl: string, slug: string, locale: "en" | "fr") {
  return `${siteUrl.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}/products/${encodeURIComponent(slug)}`;
}

export const canonicalSellerUrl = (siteUrl: string, slug: string, locale: "en" | "fr") =>
  `${siteUrl.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}/sellers/${encodeURIComponent(slug)}`;

/** Built field by field, so nothing new in the database can leak out by accident. */
export function toApiProduct(row: PublicProductRow, siteUrl: string, locale: "en" | "fr"): ApiProduct {
  const images = Array.isArray(row.images) ? row.images : [];
  const categoryName = locale === "fr" ? row.category_name_fr : row.category_name_en;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: { amountMinor: row.price_minor, currency: row.currency },
    images: images
      .filter((image): image is { url: string; alt?: unknown } => typeof image?.url === "string")
      .map((image) => ({ url: image.url, alt: typeof image.alt === "string" ? image.alt : null })),
    availability: row.availability,
    category: row.category_slug ? { slug: row.category_slug, name: categoryName ?? row.category_slug } : null,
    url: canonicalProductUrl(siteUrl, row.slug, locale),
    publishedAt: row.first_published_at,
  };
}

export const etagFor = (body: string) => `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;

/** True when the client's copy is current. Handles a list of tags and weak tags. */
export function matchesEtag(header: string | null, etag: string) {
  if (!header) return false;
  return header.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag || tag.trim() === "*");
}

// A shop's reviews, for its own website (owner's request, 2026-11-08). Same rules as the
// products: public data only, versioned, and each review links back to Biqbaq.

export const reviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  product: z.string().regex(/^[a-z0-9-]{1,200}$/).optional(),
  /** Product reviews, shop reviews from invited buyers (Q-67), or both. */
  type: z.enum(["all", "product", "shop"]).default("all"),
  locale: z.enum(["en", "fr"]).default("en"),
}).refine((query) => !(query.product && query.type === "shop"), { message: "A product has no shop reviews" });
export type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;

export function parseReviewsQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const key of ["page", "pageSize", "product", "type", "locale"]) {
    const value = params.get(key);
    if (value !== null && value !== "") raw[key] = value;
  }
  return reviewsQuerySchema.safeParse(raw);
}

export interface PublicReviewRow {
  id: string;
  kind: "product" | "shop";
  rating: number;
  body: string;
  is_verified_purchase: boolean;
  created_at: string;
  author_name: string | null;
  product_slug: string | null;
  product_name: string | null;
}

export interface ApiReview {
  id: string;
  rating: number;
  body: string;
  author: { name: string | null };
  /** "shop" for a review of the whole shop from a buyer the shop invited (Q-67). */
  type: "product" | "shop";
  /** True for shop reviews: the shop sent the buyer a one-time review link. */
  invited: boolean;
  verifiedPurchase: boolean;
  createdAt: string;
  /** The product reviewed; null for shop reviews. */
  product: { name: string; slug: string; url: string } | null;
}

/** Built field by field, so nothing new in the database can leak out by accident. */
export function toApiReview(row: PublicReviewRow, siteUrl: string, locale: "en" | "fr"): ApiReview {
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    author: { name: row.author_name },
    type: row.kind,
    invited: row.kind === "shop",
    verifiedPurchase: row.is_verified_purchase,
    createdAt: row.created_at,
    product:
      row.kind === "product" && row.product_slug && row.product_name
        ? { name: row.product_name, slug: row.product_slug, url: canonicalProductUrl(siteUrl, row.product_slug, locale) }
        : null,
  };
}

/** The average rating to one decimal place, from per-product counts and totals; null with none. */
export function reviewSummary(rows: { review_count: number; rating_total: number }[]) {
  const count = rows.reduce((sum, row) => sum + Number(row.review_count), 0);
  const total = rows.reduce((sum, row) => sum + Number(row.rating_total), 0);
  return { reviewCount: count, averageRating: count ? Math.round((total / count) * 10) / 10 : null };
}

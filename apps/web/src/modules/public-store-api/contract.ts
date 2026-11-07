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

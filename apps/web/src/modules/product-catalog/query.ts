import { z } from "zod";
import {
  CATEGORY_SLUGS,
  MARKETS,
  SORTS,
  type Availability,
  type CategorySlug,
  type Currency,
  type Market,
  type Product,
  type ProductImage,
  type ProductQuery,
} from "./types";

export const DEFAULT_PAGE_SIZE = 8;

const fallback = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

const searchParamsSchema = z.object({
  q: fallback(z.string().trim().min(1).max(100)),
  category: fallback(z.enum(CATEGORY_SLUGS)),
  market: fallback(z.enum(MARKETS)),
  sort: z.enum(SORTS).catch("newest").default("newest"),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

/** Parses untrusted URL params. Anything invalid falls back to its default. */
export function parseProductQuery(
  params: Record<string, string | string[] | undefined>,
): ProductQuery {
  const single = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  return { ...searchParamsSchema.parse(single), pageSize: DEFAULT_PAGE_SIZE };
}

/**
 * Builds a filter from what a visitor typed. Their % and _ must match literally, and
 * quoting stops a comma or bracket being read as part of the filter's own syntax.
 */
export function containsFilter(columns: string[], text: string): string {
  const pattern = text.replace(/[\\%_]/g, "\\$&");
  const quoted = `%${pattern}%`.replace(/[\\"]/g, "\\$&");
  return columns.map((column) => `${column}.ilike."${quoted}"`).join(",");
}

export const PRODUCT_COLUMNS =
  "id, slug, name, description, price_minor, currency, availability, condition, images, view_count, first_published_at, category_slug, seller_slug, seller_name, seller_city, seller_country, seller_description, seller_verified, buy_online";

export const SELLER_COLUMNS = "slug, name, city, country, verified, description";

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  availability: string;
  condition: string | null;
  images: unknown;
  view_count: number;
  first_published_at: string | null;
  category_slug: string | null;
  seller_slug: string;
  seller_name: string;
  seller_city: string;
  seller_country: string;
  seller_description: string;
  seller_verified: boolean;
  buy_online?: boolean;
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price: { amountMinor: row.price_minor, currency: row.currency as Currency },
    images: row.images as ProductImage[],
    availability: row.availability as Availability,
    condition: row.condition as Product["condition"],
    category: row.category_slug as CategorySlug,
    seller: {
      name: row.seller_name,
      slug: row.seller_slug,
      city: row.seller_city,
      country: row.seller_country as Market,
      verified: row.seller_verified,
      description: row.seller_description,
    },
    // Whether its shop takes online payments now (PRD §13, BD-03). The database decides.
    buyOnline: Boolean(row.buy_online),
    // Reviews are not built yet, so no product has any.
    reviews: [],
    views: row.view_count,
    createdAt: row.first_published_at ?? "",
  };
}

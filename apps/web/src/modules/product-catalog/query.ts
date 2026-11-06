import { z } from "zod";
import {
  CATEGORY_SLUGS,
  MARKETS,
  SORTS,
  type Product,
  type ProductPage,
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

function compare(a: Product, b: Product, sort: ProductQuery["sort"]): number {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name);
    case "price_asc":
    case "price_desc": {
      // Amounts in different currencies are not comparable, so group by currency.
      const byCurrency = a.price.currency.localeCompare(b.price.currency);
      if (byCurrency !== 0) return byCurrency;
      const diff = a.price.amountMinor - b.price.amountMinor;
      return sort === "price_asc" ? diff : -diff;
    }
    case "newest":
      return b.createdAt.localeCompare(a.createdAt);
  }
}

export function queryProducts(products: Product[], query: ProductQuery): ProductPage {
  const needle = query.q?.toLowerCase();
  const matches = products
    .filter((p) => !query.category || p.category === query.category)
    .filter((p) => !query.market || p.seller.country === query.market)
    .filter(
      (p) =>
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.seller.name.toLowerCase().includes(needle) ||
        p.seller.city.toLowerCase().includes(needle),
    )
    .sort((a, b) => compare(a, b, query.sort));

  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;

  return {
    data: matches.slice(start, start + query.pageSize),
    meta: { page, pageSize: query.pageSize, total, totalPages },
  };
}

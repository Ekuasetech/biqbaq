/** Marks cached catalogue reads, so a seller's change can refresh them straight away. */
export const CATALOG_CACHE_TAG = "catalog";

export const AVAILABILITIES = ["in_stock", "limited", "out_of_stock"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const CATEGORY_SLUGS = [
  "fashion",
  "food",
  "beauty",
  "home",
] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const MARKETS = ["CA", "NG"] as const;
export type Market = (typeof MARKETS)[number];

export const SORTS = ["newest", "price_asc", "price_desc", "name"] as const;
export type Sort = (typeof SORTS)[number];

export type Currency = "CAD" | "NGN";

export interface Money {
  /** Integer minor units (cents, kobo). */
  amountMinor: number;
  currency: Currency;
}

export interface ProductImage {
  url: string;
  alt: string;
}

/** Public seller fields only: from the `public_sellers` view. */
export interface PublicSeller {
  name: string;
  slug: string;
  city: string;
  country: Market;
  verified: boolean;
  description: string;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  body: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

/** Public product fields only: from the `public_products` view. */
export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: Money;
  images: ProductImage[];
  availability: Availability;
  condition: "new" | "used" | null;
  category: CategorySlug;
  seller: PublicSeller;
  reviews: Review[];
  views: number;
  createdAt: string;
}

export interface ProductQuery {
  q?: string;
  category?: CategorySlug;
  market?: Market;
  sort: Sort;
  page: number;
  pageSize: number;
}

export interface ProductPage {
  data: Product[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

import { cacheLife, cacheTag } from "next/cache";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { containsFilter, PRODUCT_COLUMNS, SELLER_COLUMNS, toProduct, type ProductRow } from "./query";
import { CATALOG_CACHE_TAG, type Product, type ProductPage, type ProductQuery, type PublicSeller } from "./types";

export { DEFAULT_PAGE_SIZE, parseProductQuery } from "./query";
export * from "./types";

// Pages read the catalogue only through these functions. They read public views,
// which only ever contain published products from active shops.
//
// Results are cached for about a minute. A seller's own change refreshes them at once
// (see actions.ts). A failed read throws, so an outage is never cached as "no products".

const SEARCH_COLUMNS = ["name", "description", "seller_name", "seller_city"];

function products() {
  return getSupabasePublicClient().from("public_products");
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`Catalogue read failed: ${error.message}`);
  return data as T;
}

interface Filterable {
  eq(column: string, value: string): Filterable;
  or(filter: string): Filterable;
}

function filtered<B>(builder: B, query: ProductQuery): B {
  let result = builder as unknown as Filterable;
  if (query.category) result = result.eq("category_slug", query.category);
  if (query.market) result = result.eq("seller_country", query.market);
  if (query.q) result = result.or(containsFilter(SEARCH_COLUMNS, query.q));
  return result as unknown as B;
}

async function fetchPage(query: ProductQuery, page: number): Promise<ProductPage> {
  const start = (page - 1) * query.pageSize;
  let request = filtered(products().select(PRODUCT_COLUMNS, { count: "exact" }), query);

  if (query.sort === "name") {
    request = request.order("name");
  } else if (query.sort === "newest") {
    request = request.order("first_published_at", { ascending: false });
  } else {
    // Amounts in different currencies are not comparable, so group by currency.
    request = request.order("currency").order("price_minor", { ascending: query.sort === "price_asc" });
  }

  const { data, error, count } = await request.order("id").range(start, start + query.pageSize - 1);

  // A page past the end, usually an old link: show the last page that exists.
  if (error?.code === "PGRST103") {
    const { count: total, error: countError } = await filtered(products().select("id", { count: "exact", head: true }), query);
    if (countError) throw new Error(`Catalogue read failed: ${countError.message}`);
    const lastPage = Math.max(1, Math.ceil((total ?? 0) / query.pageSize));
    if (lastPage < page) return fetchPage(query, lastPage);
  }
  if (error) throw new Error(`Catalogue read failed: ${error.message}`);

  const total = count ?? 0;
  return {
    data: (data as unknown as ProductRow[]).map(toProduct),
    meta: { page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
  };
}

export async function listProducts(query: ProductQuery): Promise<ProductPage> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  return fetchPage(query, query.page);
}

export async function listFeaturedProducts(limit: number): Promise<Product[]> {
  return (await listProducts({ sort: "newest", page: 1, pageSize: limit })).data;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const row = unwrap(await products().select(PRODUCT_COLUMNS).eq("slug", slug).maybeSingle());
  if (!row) return null;
  const product = toProduct(row as unknown as ProductRow);
  const reviews = unwrap(
    await getSupabasePublicClient()
      .from("public_reviews")
      .select("id, rating, body, is_verified_purchase, created_at, author_name")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ) as { id: string; rating: number; body: string; is_verified_purchase: boolean; created_at: string; author_name: string | null }[];
  product.reviews = reviews.map((review) => ({
    id: review.id,
    author: review.author_name ?? "",
    rating: review.rating,
    body: review.body,
    verifiedPurchase: review.is_verified_purchase,
    createdAt: review.created_at,
  }));
  return product;
}

/** Newest first, up to a limit: pages beyond it are built the first time they are visited. */
export async function listProductSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const rows = unwrap(await products().select("slug").order("first_published_at", { ascending: false }).limit(200));
  return (rows as { slug: string }[]).map((row) => row.slug);
}

/** Up to a limit, as with products above. */
export async function listSellers(): Promise<PublicSeller[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const rows = unwrap(await getSupabasePublicClient().from("public_sellers").select(SELLER_COLUMNS).order("name").limit(200));
  return rows as PublicSeller[];
}

export async function searchSellers(text: string, limit: number): Promise<PublicSeller[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const rows = unwrap(
    await getSupabasePublicClient()
      .from("public_sellers")
      .select(SELLER_COLUMNS)
      .or(containsFilter(["name", "city"], text))
      .order("name")
      .limit(limit),
  );
  return rows as PublicSeller[];
}

export async function getSellerBySlug(slug: string): Promise<PublicSeller | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const row = unwrap(await getSupabasePublicClient().from("public_sellers").select(SELLER_COLUMNS).eq("slug", slug).maybeSingle());
  return row as PublicSeller | null;
}

export async function listProductsBySeller(slug: string): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const rows = unwrap(
    await products().select(PRODUCT_COLUMNS).eq("seller_slug", slug).order("first_published_at", { ascending: false }).limit(200),
  );
  return (rows as unknown as ProductRow[]).map(toProduct);
}

async function relatedProducts(id: string, category: string, limit: number): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  // Same category first, then others, so the row is full when it can be.
  const same = unwrap(
    await products().select(PRODUCT_COLUMNS).eq("category_slug", category).neq("id", id).order("first_published_at", { ascending: false }).limit(limit),
  ) as unknown as ProductRow[];
  if (same.length >= limit) return same.map(toProduct);
  const others = unwrap(
    await products().select(PRODUCT_COLUMNS).neq("category_slug", category).neq("id", id).order("first_published_at", { ascending: false }).limit(limit - same.length),
  ) as unknown as ProductRow[];
  return [...same, ...others].map(toProduct);
}

export async function listRelatedProducts(product: Product, limit: number): Promise<Product[]> {
  return relatedProducts(product.id, product.category, limit);
}

/** The public on/off switches Super Admin controls (PRD §7.3, §7.4). */
export async function getFeatureFlags(): Promise<{ reviews: boolean; favourites: boolean }> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_CACHE_TAG);
  const rows = unwrap(
    await getSupabasePublicClient().from("public_platform_settings").select("key, value").in("key", ["reviews.enabled", "favourites.enabled"]),
  ) as { key: string; value: unknown }[];
  const on = (key: string) => rows.find((row) => row.key === key)?.value !== false;
  return { reviews: on("reviews.enabled"), favourites: on("favourites.enabled") };
}

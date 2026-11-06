import { queryProducts } from "./query";
import { SAMPLE_PRODUCTS } from "./sample-data";
import type { Product, ProductPage, ProductQuery } from "./types";

export { DEFAULT_PAGE_SIZE, parseProductQuery } from "./query";
export * from "./types";

// Pages read the catalogue only through these functions. They are async so
// that swapping sample data for Supabase does not change any caller.

export async function listProducts(query: ProductQuery): Promise<ProductPage> {
  return queryProducts(SAMPLE_PRODUCTS, query);
}

export async function listFeaturedProducts(limit: number): Promise<Product[]> {
  return queryProducts(SAMPLE_PRODUCTS, {
    sort: "newest",
    page: 1,
    pageSize: limit,
  }).data;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  return SAMPLE_PRODUCTS.find((p) => p.slug === slug) ?? null;
}

export async function listProductSlugs(): Promise<string[]> {
  return SAMPLE_PRODUCTS.map((p) => p.slug);
}

export async function listRelatedProducts(product: Product, limit: number): Promise<Product[]> {
  // Same category first, then others, so the row is always full.
  const sameCategory = (p: Product) => (p.category === product.category ? 0 : 1);
  return SAMPLE_PRODUCTS.filter((p) => p.id !== product.id)
    .sort((a, b) => sameCategory(a) - sameCategory(b))
    .slice(0, limit);
}

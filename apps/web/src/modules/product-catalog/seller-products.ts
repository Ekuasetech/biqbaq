import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AVAILABILITIES } from "./types";

export const PRODUCT_STATUSES = ["draft", "published", "unpublished", "archived", "suspended"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface SellerProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category_id: string | null;
  price_minor: number;
  availability: (typeof AVAILABILITIES)[number];
  condition: "new" | "used" | null;
  status: ProductStatus;
}

export interface Category {
  id: string;
  slug: string;
}

// Error values are keys into the shop.errors messages. A draft needs only a name and
// a price: the database decides what publishing needs, and has the final say.
export const productFormSchema = z.object({
  name: z.string("required").trim().min(1, "required").max(150, "tooLong"),
  description: z.string().trim().max(5000, "tooLong"),
  category_id: z.string().transform((value) => value || null),
  price: z
    .string("required")
    .trim()
    .min(1, "required")
    .regex(/^\d{1,7}(\.\d{1,2})?$/, "invalidPrice")
    .transform((value) => Math.round(Number(value) * 100)),
  availability: z.enum(AVAILABILITIES),
  condition: z.string().transform((value) => (value === "new" || value === "used" ? value : null)),
});

export type ProductForm = z.output<typeof productFormSchema>;

const toColumns = ({ price, ...form }: ProductForm) => ({ ...form, price_minor: price });

/** Shows stored cents in the price box, as 12.50. */
export const priceInputValue = (minor: number) => (minor / 100).toFixed(2);

export const SHOP_PRODUCTS_PAGE_SIZE = 20;

/** One page of a shop's products, newest first, with how many there are in all (`count`). */
export async function listShopProducts(supabase: SupabaseClient, sellerId: string, page = 1) {
  const from = (Math.max(page, 1) - 1) * SHOP_PRODUCTS_PAGE_SIZE;
  return supabase
    .from("products")
    .select("id, slug, name, description, category_id, price_minor, availability, condition, status", { count: "exact" })
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + SHOP_PRODUCTS_PAGE_SIZE - 1);
}

export async function listCategories(supabase: SupabaseClient) {
  return supabase.from("categories").select("id, slug").order("slug");
}

export async function createDraft(supabase: SupabaseClient, sellerId: string, form: ProductForm) {
  return supabase.from("products").insert({ seller_id: sellerId, ...toColumns(form) });
}

export async function updateProduct(supabase: SupabaseClient, productId: string, form: ProductForm) {
  return supabase.from("products").update(toColumns(form)).eq("id", productId);
}

export const publishProduct = (supabase: SupabaseClient, id: string) => supabase.rpc("publish_product", { p_product_id: id });
export const unpublishProduct = (supabase: SupabaseClient, id: string) => supabase.rpc("unpublish_product", { p_product_id: id });
export const deleteProduct = (supabase: SupabaseClient, id: string) => supabase.rpc("delete_product", { p_product_id: id });

const ERROR_KEYS: Record<string, string> = {
  PUBLISH_ALLOWANCE_EXHAUSTED: "allowanceUsed",
  PUBLISHING_DISABLED: "publishingOff",
  SELLER_PUBLISHING_SUSPENDED: "shopSuspended",
  PRODUCT_INCOMPLETE: "incomplete",
  PRODUCT_NOT_PUBLISHABLE: "notPublishable",
  PRODUCT_NOT_PUBLISHED: "notPublishable",
  PRODUCT_SUSPENDED: "notPublishable",
  NOT_AUTHORIZED: "notAllowed",
};

/** Maps a refusal to a message, without showing the database's wording. */
export function shopErrorKey(error: { code?: string; message: string }): string {
  if (ERROR_KEYS[error.message]) return ERROR_KEYS[error.message];
  return error.code === "42501" ? "notAllowed" : "generic";
}

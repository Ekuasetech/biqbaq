import type { NextRequest } from "next/server";
import { canonicalSellerUrl, parseApiQuery, sellerSlugSchema } from "@/modules/public-store-api/contract";
import { getStorefront } from "@/modules/public-store-api";
import { apiFail, apiJson, apiOptions, apiRateLimit } from "@/modules/public-store-api/http";

export const OPTIONS = apiOptions;

export async function GET(request: NextRequest, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const { sellerSlug } = await params;
  if (!sellerSlugSchema.safeParse(sellerSlug).success) return apiFail(404, "SELLER_NOT_FOUND");
  const query = parseApiQuery(request.nextUrl.searchParams);
  if (!query.success) return apiFail(400, "INVALID_QUERY");
  const refused = await apiRateLimit(request);
  if (refused) return refused;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let storefront;
  try {
    storefront = await getStorefront(sellerSlug, query.data, siteUrl);
  } catch {
    console.error("Public seller API failed");
    return apiFail(500, "GENERIC");
  }
  if (!storefront) return apiFail(404, "SELLER_NOT_FOUND");

  const { page, pageSize, locale } = query.data;
  return apiJson(request, {
    seller: { ...storefront.seller, url: canonicalSellerUrl(siteUrl, storefront.seller.slug, locale) },
    data: storefront.products,
    meta: { page, pageSize, total: storefront.total, totalPages: Math.ceil(storefront.total / pageSize) },
  });
}

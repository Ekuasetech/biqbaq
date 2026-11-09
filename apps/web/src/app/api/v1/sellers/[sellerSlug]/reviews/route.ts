import type { NextRequest } from "next/server";
import { canonicalSellerUrl, parseReviewsQuery, sellerSlugSchema } from "@/modules/public-store-api/contract";
import { getShopReviews } from "@/modules/public-store-api";
import { apiFail, apiJson, apiOptions, apiRateLimit } from "@/modules/public-store-api/http";

export const OPTIONS = apiOptions;

/**
 * A shop's reviews, for its own website (owner's request, 2026-11-08): the same rules as the
 * products endpoint, and the same hourly allowance.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const { sellerSlug } = await params;
  if (!sellerSlugSchema.safeParse(sellerSlug).success) return apiFail(404, "SELLER_NOT_FOUND");
  const query = parseReviewsQuery(request.nextUrl.searchParams);
  if (!query.success) return apiFail(400, "INVALID_QUERY");
  const refused = await apiRateLimit(request);
  if (refused) return refused;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let shop;
  try {
    shop = await getShopReviews(sellerSlug, query.data, siteUrl);
  } catch {
    console.error("Public reviews API failed");
    return apiFail(500, "GENERIC");
  }
  if (!shop) return apiFail(404, "SELLER_NOT_FOUND");

  const { page, pageSize, locale } = query.data;
  return apiJson(request, {
    seller: { ...shop.seller, url: canonicalSellerUrl(siteUrl, shop.seller.slug, locale) },
    summary: shop.summary,
    data: shop.reviews,
    meta: { page, pageSize, total: shop.summary.reviewCount, totalPages: Math.ceil(shop.summary.reviewCount / pageSize) },
  });
}

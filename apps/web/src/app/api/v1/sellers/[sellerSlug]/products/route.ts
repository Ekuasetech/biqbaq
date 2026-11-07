import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { canonicalSellerUrl, etagFor, matchesEtag, parseApiQuery, sellerSlugSchema } from "@/modules/public-store-api/contract";
import { getStorefront } from "@/modules/public-store-api";
import { clientAddress, hashForLog } from "@/modules/seller-contact/server";

// Any website may call this from a visitor's browser. It takes no key and sends no cookies,
// and it only returns public data, so allowing every origin gives nothing away.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Retry-After",
  "Access-Control-Max-Age": "86400",
};

const fail = (status: number, code: string, headers: Record<string, string> = {}) =>
  NextResponse.json({ error: { code, message: code, details: {} } }, { status, headers: { ...CORS, ...headers } });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ sellerSlug: string }> }) {
  const { sellerSlug } = await params;
  if (!sellerSlugSchema.safeParse(sellerSlug).success) return fail(404, "SELLER_NOT_FOUND");
  const query = parseApiQuery(request.nextUrl.searchParams);
  if (!query.success) return fail(400, "INVALID_QUERY");

  // The limit is per internet address, and only a scrambled form of the address is stored.
  // If counting fails for any other reason, the request is served: this is public data.
  const secret = process.env.CONTACT_HASH_SECRET;
  if (secret) {
    const { error } = await getSupabaseAdminClient().rpc("count_public_api_request", {
      p_ip_hash: hashForLog(secret, clientAddress(request.headers)),
    });
    if (error?.message === "RATE_LIMITED") return fail(429, "RATE_LIMITED", { "Retry-After": "3600" });
    if (error) console.error("Could not count an API request", error.code);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let storefront;
  try {
    storefront = await getStorefront(sellerSlug, query.data, siteUrl);
  } catch {
    console.error("Public seller API failed");
    return fail(500, "GENERIC");
  }
  if (!storefront) return fail(404, "SELLER_NOT_FOUND");

  const { page, pageSize, locale } = query.data;
  const body = JSON.stringify({
    seller: { ...storefront.seller, url: canonicalSellerUrl(siteUrl, storefront.seller.slug, locale) },
    data: storefront.products,
    meta: { page, pageSize, total: storefront.total, totalPages: Math.ceil(storefront.total / pageSize) },
  });
  const etag = etagFor(body);
  const headers = {
    ...CORS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    ETag: etag,
  };
  if (matchesEtag(request.headers.get("if-none-match"), etag)) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(body, { status: 200, headers });
}

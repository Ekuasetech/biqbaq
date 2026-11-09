import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { clientAddress, hashForLog } from "@/modules/seller-contact/server";
import { etagFor, matchesEtag } from "./contract";

// Any website may call the public seller API from a visitor's browser. It takes no key and
// sends no cookies, and it only returns public data, so allowing every origin gives nothing away.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Retry-After",
  "Access-Control-Max-Age": "86400",
};

export const apiFail = (status: number, code: string, headers: Record<string, string> = {}) =>
  NextResponse.json({ error: { code, message: code, details: {} } }, { status, headers: { ...CORS, ...headers } });

export const apiOptions = () => new NextResponse(null, { status: 204, headers: CORS });

/**
 * Counts the request against the caller's hourly allowance, shared by every public seller
 * endpoint. Only a scrambled form of the address is stored. Returns a reply when refused; if
 * counting fails for any other reason, the request is served, as this is public data.
 */
export async function apiRateLimit(request: NextRequest) {
  const secret = process.env.CONTACT_HASH_SECRET;
  if (!secret) return null;
  const { error } = await getSupabaseAdminClient().rpc("count_public_api_request", {
    p_ip_hash: hashForLog(secret, clientAddress(request.headers)),
  });
  if (error?.message === "RATE_LIMITED") return apiFail(429, "RATE_LIMITED", { "Retry-After": "3600" });
  if (error) console.error("Could not count an API request", error.code);
  return null;
}

/** The JSON reply, cached briefly, with an ETag so an unchanged answer costs nothing. */
export function apiJson(request: NextRequest, value: unknown) {
  const body = JSON.stringify(value);
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

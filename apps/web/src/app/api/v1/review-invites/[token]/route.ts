import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import { clientAddress, hashForLog } from "@/modules/seller-contact/server";
import { invitedReviewSchema, reviewTokenSchema } from "@/modules/shop-reviews";

type Context = { params: Promise<{ token: string }> };
const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status });

/** What a review link is for: the shop, the buyer's name, and whether it still works. */
export async function GET(_request: Request, { params }: Context) {
  const token = reviewTokenSchema.safeParse((await params).token);
  if (!token.success) return fail(404, "INVITE_NOT_FOUND");
  const { data, error } = await getSupabaseAdminClient().rpc("lookup_review_invite", { p_token: token.data });
  if (error) return fail(500, "GENERIC");
  const row = (data as { state: string; shop_name: string; shop_slug: string; buyer_name: string }[] | null)?.[0];
  if (!row) return fail(404, "INVITE_NOT_FOUND");
  return NextResponse.json({ data: row }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * The buyer's review (Q-67). No account is needed: the one-time link is the permission. The
 * database checks the link and limits how often one connection may send reviews.
 */
export async function POST(request: Request, { params }: Context) {
  const token = reviewTokenSchema.safeParse((await params).token);
  if (!token.success) return fail(404, "INVITE_NOT_FOUND");
  const body = invitedReviewSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "DETAILS_INVALID");
  // A robot filled in the hidden field: it looks like success, so it learns nothing.
  if (body.data.website) return NextResponse.json({ data: { shop: null } }, { status: 201 });
  const secret = process.env.CONTACT_HASH_SECRET;
  if (!secret) return fail(503, "GENERIC");
  const { data, error } = await getSupabaseAdminClient().rpc("submit_invited_review", {
    p_token: token.data,
    p_name: body.data.name,
    p_rating: body.data.rating,
    p_body: body.data.body,
    p_ip_hash: hashForLog(secret, clientAddress(request.headers)),
  });
  if (error) {
    const known = ["RATE_LIMITED", "INVITE_USED", "INVITE_EXPIRED", "INVITE_NOT_FOUND", "REVIEWS_OFF", "DETAILS_INVALID"];
    if (known.includes(error.message)) return fail(error.message === "RATE_LIMITED" ? 429 : error.message === "INVITE_NOT_FOUND" ? 404 : 409, error.message);
    console.error("An invited review could not be saved", error.code);
    return fail(500, "GENERIC");
  }
  // The seller's page shows it at once.
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  return NextResponse.json({ data: { shop: data } }, { status: 201 });
}

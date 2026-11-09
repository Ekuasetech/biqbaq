import "server-only";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSellerAccount, readiness, StripeError } from "./stripe";

export const fail = (code: string, status: number) => NextResponse.json({ error: code }, { status });

export const siteOrigin = (request: Request) => process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;

/** Turns a Stripe failure into a reply that shows nothing of Stripe's wording. */
export function stripeFailure(error: unknown) {
  if (error instanceof StripeError && error.code === "NOT_CONFIGURED") return fail("NOT_CONFIGURED", 503);
  console.error("Stripe request failed", error instanceof StripeError ? `${error.status} ${error.code}` : "unexpected");
  return fail("PROVIDER_FAILED", 502);
}

/**
 * The signed-in owner's shop and its Stripe account, through the database's own check.
 * Null when the caller may not set up payments for it.
 */
export async function ownerSetup(sellerId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("payment_account_for_setup", { p_seller: sellerId });
  const row = (data as { allowed: boolean; provider_account_id: string | null; shop_name: string; owner_email: string | null }[] | null)?.[0];
  if (error || !row) return null;
  return row;
}

/** Asks Stripe how a seller's account stands, and records it (§13.3). */
export async function refreshAccount(sellerId: string, accountId: string) {
  const state = readiness(await getSellerAccount(accountId));
  const { data, error } = await getSupabaseAdminClient().rpc("record_payment_account", {
    p_seller: sellerId,
    p_provider_account_id: accountId,
    p_charges_enabled: state.chargesEnabled,
    p_payouts_enabled: state.payoutsEnabled,
    p_requirements_due: state.requirementsDue,
    p_restricted: state.restricted,
  });
  if (error) throw new Error(`Could not record the payment account: ${error.code}`);
  // Product pages show "Buy now" from this, so they are refreshed at once.
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  return data as string;
}

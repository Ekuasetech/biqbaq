import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { fail, ownerSetup, siteOrigin, stripeFailure } from "@/modules/payment-management/server";
import { createSellerAccount, onboardingLink, readiness } from "@/modules/payment-management/stripe";
import { CATALOG_CACHE_TAG } from "@/modules/product-catalog/types";

/**
 * Sends a seller to Stripe to set up payments (§13.3), making their Stripe account the
 * first time. Only the shop's owner, and only once Super Admin has allowed it (§13.1).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { seller?: unknown; locale?: unknown } | null;
  const seller = z.uuid().safeParse(body?.seller);
  if (!seller.success) return fail("NOT_ALLOWED", 400);
  const setup = await ownerSetup(seller.data);
  if (!setup) return fail("NOT_ALLOWED", 403);
  if (!setup.allowed) return fail("PAYMENTS_UNAVAILABLE", 403);

  try {
    let accountId = setup.provider_account_id;
    if (!accountId) {
      const account = await createSellerAccount({ sellerId: seller.data, email: setup.owner_email, shopName: setup.shop_name });
      accountId = account.id;
      const state = readiness(account);
      const { error } = await getSupabaseAdminClient().rpc("record_payment_account", {
        p_seller: seller.data,
        p_provider_account_id: accountId,
        p_charges_enabled: state.chargesEnabled,
        p_payouts_enabled: state.payoutsEnabled,
        p_requirements_due: state.requirementsDue,
        p_restricted: state.restricted,
      });
      if (error) return fail("GENERIC", 500);
      revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
    }
    const prefix = body?.locale === "fr" ? "/fr" : "";
    const back = `${siteOrigin(request)}${prefix}/account/shop/settings`;
    const url = await onboardingLink(accountId, `${back}?payments=returned#online-payments`, `${back}?payments=again#online-payments`);
    return NextResponse.json({ url });
  } catch (error) {
    return stripeFailure(error);
  }
}

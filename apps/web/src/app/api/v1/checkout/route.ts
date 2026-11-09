import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fail, siteOrigin, stripeFailure } from "@/modules/payment-management/server";
import { createCheckout } from "@/modules/payment-management/stripe";

const bodySchema = z.object({ product: z.uuid(), quantity: z.number().int().min(1).max(1000), locale: z.enum(["en", "fr"]).catch("en") });

const KNOWN = new Set(["QUANTITY_INVALID", "PRODUCT_NOT_FOUND", "OUT_OF_STOCK", "PAYMENTS_UNAVAILABLE", "OWN_SHOP", "TOTAL_TOO_SMALL", "RATE_LIMITED"]);

/**
 * Starts paying for a product (BD-03). The database checks and prices the order; then
 * Stripe's checkout opens on the seller's account, with Biqbaq's service fee as its own
 * line, paid by the buyer (BD-02).
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("QUANTITY_INVALID", 400);
  const supabase = await getSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return fail("SIGN_IN", 401);

  const { data, error } = await supabase.rpc("begin_order", { p_product: parsed.data.product, p_quantity: parsed.data.quantity });
  if (error) return fail(KNOWN.has(error.message) ? error.message : "GENERIC", error.code === "42501" ? 403 : 409);
  const order = (data as {
    order_id: string;
    order_number: string;
    provider_account_id: string;
    product_name: string;
    unit_price_minor: number;
    quantity: number;
    application_fee_minor: number;
    buyer_email: string | null;
    product_slug: string;
  }[])[0];

  const origin = siteOrigin(request);
  const prefix = parsed.data.locale === "fr" ? "/fr" : "";
  try {
    const session = await createCheckout({
      accountId: order.provider_account_id,
      orderId: order.order_id,
      orderNumber: order.order_number,
      productName: order.product_name,
      unitPriceMinor: order.unit_price_minor,
      quantity: order.quantity,
      applicationFeeMinor: order.application_fee_minor,
      serviceFeeLabel: (await getTranslations({ locale: parsed.data.locale, namespace: "payments.buy" }))("feeLine"),
      buyerEmail: order.buyer_email,
      locale: parsed.data.locale,
      // Shows the buyer it went through; the order is marked paid only by Stripe's notice.
      successUrl: `${origin}${prefix}/account/orders?placed=${encodeURIComponent(order.order_number)}`,
      cancelUrl: `${origin}${prefix}/products/${order.product_slug}?checkout=cancelled`,
    });
    await getSupabaseAdminClient().rpc("attach_checkout", { p_order: order.order_id, p_session_id: session.id });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return stripeFailure(error);
  }
}

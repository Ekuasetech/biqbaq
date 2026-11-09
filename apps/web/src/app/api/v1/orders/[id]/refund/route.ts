import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fail, stripeFailure } from "@/modules/payment-management/server";
import { createRefund } from "@/modules/payment-management/stripe";

/**
 * A seller refunds an order, in full or in part. The database checks who may and how much
 * is left; Stripe takes it from the seller's balance; Biqbaq's fee is kept (BD-02).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { amount_minor?: unknown; key?: unknown } | null;
  const amount = z.number().int().min(1).safeParse(body?.amount_minor);
  const key = z.uuid().safeParse(body?.key);
  if (!z.uuid().safeParse(id).success || !amount.success || !key.success) return fail("AMOUNT_INVALID", 400);

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("prepare_refund", { p_order: id, p_amount_minor: amount.data });
  if (error) {
    const code = ["AMOUNT_INVALID", "ORDER_NOT_PAID"].includes(error.message) ? error.message : error.code === "42501" ? "NOT_ALLOWED" : "GENERIC";
    return fail(code, error.code === "42501" ? 403 : 409);
  }
  const order = (data as { provider_account_id: string; provider_payment_id: string }[])[0];
  try {
    // The page's key makes a repeated press refund once.
    const refund = await createRefund({ accountId: order.provider_account_id, paymentId: order.provider_payment_id, amountMinor: amount.data, key: `refund:${key.data}` });
    await getSupabaseAdminClient().rpc("record_refund", {
      p_provider_account_id: order.provider_account_id,
      p_payment_id: order.provider_payment_id,
      p_refund_id: refund.id,
      p_amount_minor: refund.amount,
      p_status: refund.status,
    });
    return NextResponse.json({ status: refund.status });
  } catch (error) {
    return stripeFailure(error);
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshAccount } from "@/modules/payment-management/server";
import { isValidStripeSignature } from "@/modules/payment-management/stripe";

// Stripe's notices about sellers' payments (§13.4). Every one must carry Stripe's
// signature. Handling is idempotent, so a notice Stripe repeats changes nothing; a failure
// answers 500, so Stripe tries again later. Orders are marked paid only from here.

interface StripeEvent {
  id: string;
  type: string;
  /** The seller's account, for notices about their payments. */
  account?: string;
  data: { object: Record<string, unknown> };
}

type Address = { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;

const text = (value: unknown) => (typeof value === "string" ? value : null);
const id = (value: unknown) => (typeof value === "string" ? value : typeof (value as { id?: unknown })?.id === "string" ? (value as { id: string }).id : null);

async function handle(event: StripeEvent) {
  const admin = getSupabaseAdminClient();
  const object = event.data.object;
  const account = event.account ?? null;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      if (!account) return;
      const outcome =
        event.type === "checkout.session.expired" ? "expired"
        : event.type === "checkout.session.async_payment_failed" ? "failed"
        : object.payment_status === "paid" ? "paid"
        : null; // Paid later, by a slower payment method: its own notice follows.
      if (!outcome) return;
      const customer = (object.customer_details ?? {}) as { email?: unknown; name?: unknown; phone?: unknown };
      // Stripe has moved the delivery details between versions; either place is accepted.
      const shipping = ((object.collected_information as { shipping_details?: unknown } | null)?.shipping_details ?? object.shipping_details ?? null) as
        | { name?: unknown; address?: Address }
        | null;
      const { error } = await admin.rpc("record_checkout", {
        p_session_id: text(object.id),
        p_provider_account_id: account,
        p_outcome: outcome,
        p_payment_id: id(object.payment_intent),
        p_amount_minor: typeof object.amount_total === "number" ? object.amount_total : null,
        p_email: text(customer.email),
        p_name: text(shipping?.name) ?? text(customer.name),
        p_phone: text(customer.phone),
        p_address: shipping?.address ?? null,
      });
      if (error) throw new Error(`record_checkout ${error.code} ${error.message}`);
      return;
    }
    case "refund.created":
    case "refund.updated":
    case "charge.refund.updated": {
      if (!account) return;
      const { error } = await admin.rpc("record_refund", {
        p_provider_account_id: account,
        p_payment_id: id(object.payment_intent),
        p_refund_id: text(object.id),
        p_amount_minor: typeof object.amount === "number" ? object.amount : 0,
        p_status: text(object.status) ?? "pending",
      });
      if (error) throw new Error(`record_refund ${error.code}`);
      return;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      if (!account) return;
      const { error } = await admin.rpc("record_dispute", {
        p_provider_account_id: account,
        p_payment_id: id(object.payment_intent),
        p_dispute_id: text(object.id),
        p_amount_minor: typeof object.amount === "number" ? object.amount : 0,
        p_status: text(object.status) ?? "needs_response",
      });
      if (error) throw new Error(`record_dispute ${error.code}`);
      return;
    }
    case "account.updated": {
      const accountId = account ?? text(object.id);
      if (!accountId) return;
      const { data: seller } = await admin.rpc("seller_for_payment_account", { p_provider_account_id: accountId });
      if (seller) await refreshAccount(seller as string, accountId);
      return;
    }
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_")) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const payload = await request.text();
  if (!isValidStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 400 });
  }
  const event = JSON.parse(payload) as StripeEvent;
  try {
    await handle(event);
    await getSupabaseAdminClient().rpc("claim_payment_event", { p_provider: "stripe", p_event_id: event.id, p_type: event.type });
  } catch (error) {
    console.error("Stripe notice not handled", event.type, error instanceof Error ? error.message.slice(0, 120) : "unexpected");
    return NextResponse.json({ error: "NOT_HANDLED" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

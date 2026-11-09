import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ownerSetup, stripeFailure } from "@/modules/payment-management/server";
import { dashboardLink } from "@/modules/payment-management/stripe";

/** A one-time link to the seller's Stripe Express dashboard: payouts, refunds and disputes. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { seller?: unknown } | null;
  const seller = z.uuid().safeParse(body?.seller);
  if (!seller.success) return fail("NOT_ALLOWED", 400);
  const setup = await ownerSetup(seller.data);
  if (!setup?.provider_account_id) return fail("NOT_ALLOWED", 403);
  try {
    return NextResponse.json({ url: await dashboardLink(setup.provider_account_id) });
  } catch (error) {
    return stripeFailure(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ownerSetup, refreshAccount, stripeFailure } from "@/modules/payment-management/server";

/** Asks Stripe how the seller's account stands now, as when they return from Stripe. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { seller?: unknown } | null;
  const seller = z.uuid().safeParse(body?.seller);
  if (!seller.success) return fail("NOT_ALLOWED", 400);
  const setup = await ownerSetup(seller.data);
  if (!setup) return fail("NOT_ALLOWED", 403);
  if (!setup.provider_account_id) return NextResponse.json({ status: "disabled" });
  try {
    return NextResponse.json({ status: await refreshAccount(seller.data, setup.provider_account_id) });
  } catch (error) {
    return stripeFailure(error);
  }
}

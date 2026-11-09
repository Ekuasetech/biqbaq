import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyFormSubmit } from "@/modules/email-lists/formsubmit";
import { popupSignupSchema } from "@/modules/email-lists/popup";
import { clientAddress, hashForLog } from "@/modules/seller-contact/server";

const fail = (status: number, code: string) => NextResponse.json({ error: code }, { status });
const done = () => NextResponse.json({ status: "subscribed" }, { status: 202 });

/**
 * A visitor signs up from the pop-up. FormSubmit tells the owner's address, and that is all
 * (owner's decision): Biqbaq neither keeps the address nor emails it. The database checks the
 * pop-up is on, the address looks right, and the limits allow it.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 2_000) return fail(400, "EMAIL_INVALID");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "EMAIL_INVALID");
  }
  // A hidden field only a robot fills in. It looks like success, so the robot learns nothing.
  if (typeof json === "object" && json !== null && (json as { website?: unknown }).website) return done();
  const body = popupSignupSchema.safeParse(json);
  if (!body.success) return fail(400, "EMAIL_INVALID");

  const secret = process.env.CONTACT_HASH_SECRET;
  if (!secret) return fail(503, "GENERIC");
  const { data, error } = await getSupabaseAdminClient().rpc("subscribe_from_popup", {
    p_email: body.data.email,
    p_ip_hash: hashForLog(secret, clientAddress(request.headers)),
    p_locale: body.data.locale,
  });
  if (error) {
    if (error.message === "RATE_LIMITED") return fail(429, "RATE_LIMITED");
    if (error.message === "POPUP_OFF") return fail(409, "POPUP_OFF");
    if (error.message === "EMAIL_INVALID") return fail(400, "EMAIL_INVALID");
    console.error("Sign-up could not be saved", error.code);
    return fail(500, "GENERIC");
  }

  const to = (data as { notify_email: string | null }[] | null)?.[0]?.notify_email;
  if (!to) return fail(503, "GENERIC");
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  // FormSubmit is the only record of the sign-up, so the visitor is told if it did not go.
  const sent = await notifyFormSubmit({ to, subscriber: body.data.email, locale: body.data.locale, siteOrigin: origin });
  if (sent === "failed") return fail(502, "GENERIC");
  return done();
}

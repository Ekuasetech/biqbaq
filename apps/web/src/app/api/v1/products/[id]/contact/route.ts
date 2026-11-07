import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmailService } from "@/modules/notifications/email-service";
import { contactRequestSchema } from "@/modules/seller-contact/schema";
import { clientAddress, hashForLog, renderEnquiryEmail } from "@/modules/seller-contact/server";

const fail = (status: number, code: string, details: object = {}) =>
  NextResponse.json({ error: { code, message: code, details } }, { status });

const MAX_BODY_LENGTH = 20_000;

// Sends straight away rather than through a job, because the message is deliberately not stored
// and the visitor is told whether it worked (PRD §9.2). The seller's address never leaves here.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(404, "PRODUCT_NOT_FOUND");

  const raw = await request.text();
  if (raw.length > MAX_BODY_LENGTH) return fail(400, "INVALID_REQUEST");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "INVALID_REQUEST");
  }

  // A hidden field only a robot fills in. It looks like success, so the robot learns nothing.
  if (typeof json === "object" && json !== null && (json as { website?: unknown }).website) {
    return NextResponse.json({ data: { status: "sent" } }, { status: 202 });
  }

  const body = contactRequestSchema.safeParse(json);
  if (!body.success) return fail(400, "INVALID_REQUEST", { fields: body.error.issues.map((issue) => issue.path[0]) });

  const secret = process.env.CONTACT_HASH_SECRET;
  if (!secret) return fail(503, "CONTACT_UNAVAILABLE");

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("prepare_contact_enquiry", {
    p_product_id: id,
    p_visitor_email_hash: hashForLog(secret, body.data.email),
    p_ip_hash: hashForLog(secret, clientAddress(request.headers)),
  });
  if (error) {
    if (error.code === "P0002") return fail(404, "PRODUCT_NOT_FOUND");
    if (error.message === "RATE_LIMITED") return fail(429, "RATE_LIMITED");
    if (error.code === "55000") return fail(503, "CONTACT_UNAVAILABLE");
    console.error("Enquiry could not be prepared", error.code);
    return fail(500, "GENERIC");
  }

  const prepared = (data as { enquiry_id: string; seller_email: string; seller_locale: string; product_name: string; product_slug: string }[])[0];
  const email = renderEnquiryEmail(
    body.data,
    { name: prepared.product_name, slug: prepared.product_slug },
    prepared.seller_locale,
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  );
  const sent = await EmailService.send(prepared.seller_email, email, {
    idempotencyKey: prepared.enquiry_id,
    replyTo: body.data.email,
    timeoutMs: 10_000,
    useLocalInbox: true,
  });

  await supabase.rpc("finish_contact_enquiry", {
    p_enquiry_id: prepared.enquiry_id,
    p_sent: sent.status !== "failed",
    p_provider_message_id: sent.status === "sent" ? sent.messageId : null,
    p_error: sent.status === "failed" ? sent.code : null,
  });

  if (sent.status === "failed") {
    console.error("Enquiry email failed", sent.code);
    return fail(502, "NOT_SENT");
  }
  return NextResponse.json({ data: { status: "sent" } }, { status: 202 });
}

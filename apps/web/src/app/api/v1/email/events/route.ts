import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidHookSignature } from "@/modules/notifications/auth-emails";

// Resend's reports of spam complaints and permanent bounces (Q-55), which pause a shop's
// bulk email when they pass the limits in Settings. Set up in the Resend dashboard, pointing
// here, with its signing secret in RESEND_WEBHOOK_SECRET. Every request must carry Resend's
// signature (Svix: the same scheme as the Supabase email hook).

const eventSchema = z.object({
  type: z.string(),
  data: z.object({ email_id: z.string().min(1).max(100), bounce: z.object({ type: z.string().optional() }).optional() }),
});

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_")) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const body = await request.text();
  const signed = isValidHookSignature(`v1,${secret}`, body, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });
  if (!signed) return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });

  const parsed = eventSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return NextResponse.json({ result: "ignored" });
  const { type, data } = parsed.data;
  // Only permanent bounces count: a full mailbox may work tomorrow.
  const event = type === "email.complained" ? "complained" : type === "email.bounced" && (data.bounce?.type ?? "Permanent") === "Permanent" ? "bounced" : null;
  if (!event) return NextResponse.json({ result: "ignored" });

  const { data: result, error } = await getSupabaseAdminClient().rpc("record_email_event", { p_message_id: data.email_id, p_event: event });
  // A failure asks Resend to try again later.
  if (error) return NextResponse.json({ error: "NOT_RECORDED" }, { status: 500 });
  return NextResponse.json({ result });
}

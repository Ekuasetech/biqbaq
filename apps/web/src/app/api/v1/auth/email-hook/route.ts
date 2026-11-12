import { NextResponse } from "next/server";
import { buildAuthEmails, hookPayloadSchema, isValidHookSignature } from "@/modules/notifications/auth-emails";
import { EmailService } from "@/modules/notifications/email-service";
import { loadEmailCustom } from "@/modules/notifications/load-custom";

const fail = (status: number, code: string) =>
  NextResponse.json({ error: { http_code: status, code, message: code, details: {} } }, { status });

// Supabase Auth calls this whenever it needs to email someone (sign-up confirmation, password
// reset). These links are credentials: they are sent straight away and never stored or logged.
export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !apiUrl) return fail(503, "EMAIL_HOOK_NOT_CONFIGURED");

  const body = await request.text();
  const id = request.headers.get("webhook-id");
  const valid = isValidHookSignature(secret, body, {
    id,
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  });
  if (!valid) return fail(401, "NOT_AUTHORIZED");

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail(400, "INVALID_REQUEST");
  }
  const payload = hookPayloadSchema.safeParse(json);
  if (!payload.success) return fail(400, "INVALID_REQUEST");

  const emails = buildAuthEmails(payload.data, apiUrl, await loadEmailCustom());
  for (const [index, { to, email }] of emails.entries()) {
    const result = await EmailService.send(to, email, {
      idempotencyKey: `auth:${id}:${index}`,
      // Supabase Auth stops waiting after a few seconds.
      timeoutMs: 4_000,
      useLocalInbox: true,
    });
    if (result.status === "failed") {
      console.error("Account email failed", result.code);
      return fail(502, "EMAIL_NOT_SENT");
    }
  }
  return NextResponse.json({});
}

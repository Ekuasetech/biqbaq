import "server-only";
import { isRetriableStatus, resolveDelivery, type EmailEnv } from "./delivery";
import type { RenderedEmail } from "./templates";

export type SendResult =
  | { status: "sent"; messageId: string | null }
  | { status: "suppressed" }
  | { status: "failed"; code: string; retry: boolean };

const readEnv = (): EmailEnv => ({
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM,
  testRecipient: process.env.EMAIL_TEST_RECIPIENT,
  liveSending: process.env.EMAIL_LIVE_SENDING,
});

/** Every email Biqbaq sends goes through here (PRD §18.1). */
export const EmailService = {
  isConfigured() {
    const env = readEnv();
    return Boolean(env.apiKey && env.from && (env.testRecipient || env.liveSending === "true"));
  },

  async send(to: string, email: RenderedEmail, options: { idempotencyKey: string; replyTo?: string }): Promise<SendResult> {
    const env = readEnv();
    const delivery = resolveDelivery(to, env);
    if (delivery.kind === "suppress") return { status: "suppressed" };
    if (delivery.kind === "refuse") return { status: "failed", code: delivery.reason, retry: true };

    const redirected = delivery.redirectedFrom !== undefined;
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "biqbaq",
          // If a worker stops after Resend accepted an email, the retry will not send it twice.
          "Idempotency-Key": options.idempotencyKey,
        },
        body: JSON.stringify({
          from: env.from,
          to: [delivery.to],
          subject: redirected ? `[Test] ${email.subject}` : email.subject,
          text: email.text,
          html: email.html,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { status: "failed", code: "RESEND_UNREACHABLE", retry: true };
    }

    if (!response.ok) {
      // Only the status and Resend's short error name are kept: its wording can repeat addresses.
      const body = (await response.json().catch(() => null)) as { name?: unknown } | null;
      const name = typeof body?.name === "string" && /^[a-z_]+$/.test(body.name) ? `_${body.name}` : "";
      return { status: "failed", code: `RESEND_${response.status}${name}`, retry: isRetriableStatus(response.status) };
    }

    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    return { status: "sent", messageId: typeof body?.id === "string" ? body.id : null };
  },
};

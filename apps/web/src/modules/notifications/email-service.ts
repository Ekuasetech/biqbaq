import "server-only";
import { isRetriableStatus, resolveDelivery, type EmailEnv } from "./delivery";
import { escapeHtml, type RenderedEmail } from "./templates";

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

/** Delivers to this computer's test inbox, so account tests never reach Resend. */
async function sendToLocalInbox(url: string, to: string, email: RenderedEmail, timeoutMs: number, replyTo?: string): Promise<SendResult> {
  try {
    const response = await fetch(`${url}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: "biqbaq@example.com", Name: "Biqbaq" },
        To: [{ Email: to }],
        Subject: email.subject,
        Text: email.text,
        HTML: email.html,
        ...(replyTo ? { ReplyTo: [{ Email: replyTo }] } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? { status: "sent", messageId: null } : { status: "failed", code: `LOCAL_INBOX_${response.status}`, retry: true };
  } catch {
    return { status: "failed", code: "LOCAL_INBOX_UNREACHABLE", retry: true };
  }
}

/** Every email Biqbaq sends goes through here (PRD §18.1). */
export const EmailService = {
  isConfigured() {
    const env = readEnv();
    return Boolean(env.apiKey && env.from && (env.testRecipient || env.liveSending === "true"));
  },

  async send(
    to: string,
    email: RenderedEmail,
    options: {
      idempotencyKey: string;
      replyTo?: string;
      timeoutMs?: number;
      useLocalInbox?: boolean;
      headers?: Record<string, string>;
      attachments?: { filename: string; content: Uint8Array }[];
    },
  ): Promise<SendResult> {
    const env = readEnv();
    const timeoutMs = options.timeoutMs ?? 15_000;
    const delivery = resolveDelivery(to, options.useLocalInbox ? { ...env, localInboxUrl: process.env.EMAIL_LOCAL_INBOX_URL } : env);
    if (delivery.kind === "suppress") return { status: "suppressed" };
    if (delivery.kind === "refuse") return { status: "failed", code: delivery.reason, retry: true };
    if (delivery.kind === "local_inbox") return sendToLocalInbox(delivery.url, to, email, timeoutMs, options.replyTo);

    const redirected = delivery.redirectedFrom !== undefined;
    const note = redirected ? `Test email, which would have gone to ${delivery.redirectedFrom}` : null;
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
          text: note ? `${note}\n\n${email.text}` : email.text,
          html: note ? `<p><em>${escapeHtml(note)}</em></p>${email.html}` : email.html,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
          ...(options.headers ? { headers: options.headers } : {}),
          ...(options.attachments
            ? { attachments: options.attachments.map((file) => ({ filename: file.filename, content: Buffer.from(file.content).toString("base64") })) }
            : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
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

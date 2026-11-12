import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmailService } from "@/modules/notifications/email-service";
import { renderInvoiceEmail } from "@/modules/invoicing/email";
import type { StoredInvoice } from "@/modules/invoicing";
import { invoiceFileName, renderInvoicePdf } from "@/modules/invoicing/pdf";
import { isListTemplate, renderListEmail, type ListEmailData } from "@/modules/notifications/list-emails";
import { loadEmailCustom } from "@/modules/notifications/load-custom";
import { renderEmail } from "@/modules/notifications/templates";

interface ClaimedEmail {
  job_id: string;
  template: string | null;
  data: ({ role?: unknown; reason?: unknown; product?: unknown; shop?: unknown; invoice_id?: unknown } & ListEmailData) | null;
  recipient_email: string | null;
  recipient_name: string | null;
  recipient_locale: string | null;
}

export interface WorkerResult {
  claimed: number;
  sent: number;
  suppressed: number;
  failed: number;
}

// Resend allows a few requests a second, so one batch sends them one at a time, with a gap.
const SEND_GAP_MS = 600;
const BATCH_SIZE = 10;

/** Sends one batch of waiting emails. Safe to run at any time, or several at once. */
export async function runEmailJobs(): Promise<WorkerResult> {
  const result: WorkerResult = { claimed: 0, sent: 0, suppressed: 0, failed: 0 };
  if (!EmailService.isConfigured()) return result;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_email_jobs", { p_limit: BATCH_SIZE });
  if (error) throw new Error(`Could not claim email jobs: ${error.code}`);

  const jobs = (data ?? []) as ClaimedEmail[];
  result.claimed = jobs.length;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // Super Admin's wording, read once for the whole run.
  const custom = await loadEmailCustom();

  for (const [index, job] of jobs.entries()) {
    const fail = async (code: string, retry: boolean) => {
      result.failed += 1;
      await supabase.rpc("fail_background_job", { p_job_id: job.job_id, p_error: code, p_retry: retry });
    };

    if (!job.recipient_email) {
      await fail("RECIPIENT_GONE", false);
      continue;
    }
    const template = job.template ?? "";

    // An invoice or receipt is read fresh and sent with its PDF attached.
    if (template === "invoice") {
      const { data: invoice, error: readError } = await supabase.rpc("get_invoice_for_sending", { p_id: String(job.data?.invoice_id ?? "") });
      if (readError || !invoice) {
        await fail("INVOICE_GONE", false);
        continue;
      }
      const locale = job.data?.locale === "fr" ? "fr" : "en";
      const stored = invoice as StoredInvoice;
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
      const sent = await EmailService.send(job.recipient_email, renderInvoiceEmail(stored, locale, custom), {
        idempotencyKey: job.job_id,
        attachments: [{ filename: invoiceFileName(stored), content: await renderInvoicePdf(stored, { locale }) }],
      });
      if (sent.status === "failed") await fail(sent.code, sent.retry);
      else {
        if (sent.status === "sent") result.sent += 1;
        else result.suppressed += 1;
        await supabase.rpc("complete_background_job", { p_job_id: job.job_id, p_provider_message_id: sent.status === "sent" ? sent.messageId : null });
      }
      continue;
    }
    // Customer list emails carry their own wording and an unsubscribe header.
    const list = isListTemplate(template) ? renderListEmail(template, job.data ?? {}, siteUrl, custom) : null;
    const email = isListTemplate(template)
      ? (list?.email ?? null)
      : renderEmail(template, job.data ?? {}, { name: job.recipient_name, locale: job.recipient_locale }, siteUrl, custom);
    if (!email) {
      // Retried, because a worker still running older code should not end a newer email.
      await fail("UNKNOWN_TEMPLATE", true);
      continue;
    }

    if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    const sent = await EmailService.send(job.recipient_email, email, { idempotencyKey: job.job_id, headers: list?.headers });
    if (sent.status === "failed") {
      await fail(sent.code, sent.retry);
    } else {
      if (sent.status === "sent") result.sent += 1;
      else result.suppressed += 1;
      await supabase.rpc("complete_background_job", {
        p_job_id: job.job_id,
        p_provider_message_id: sent.status === "sent" ? sent.messageId : null,
      });
    }
  }
  return result;
}

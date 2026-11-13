import "server-only";
import webpush from "web-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { pushText } from "./text";

interface ClaimedPush {
  job_id: string;
  template: string;
  data: Record<string, unknown>;
  tag: string | null;
  locale: string;
  devices: { endpoint: string; p256dh: string; auth: string }[];
}

export interface PushResult {
  claimed: number;
  sent: number;
  forgotten: number;
  failed: number;
}

/** Whether this server can send pushes: its keys are set. */
export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/**
 * Sends the queued phone notifications (Q-66) to each of the person's devices. A device the
 * push service says is gone (404 or 410) is forgotten; other failures are retried later, as
 * for emails.
 */
export async function runPushJobs(): Promise<PushResult> {
  const result: PushResult = { claimed: 0, sent: 0, forgotten: 0, failed: 0 };
  if (!pushConfigured()) return result;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://biqbaq.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_push_jobs", { p_limit: 20 });
  if (error) throw new Error(`Could not claim push jobs: ${error.code}`);
  const jobs = (data ?? []) as ClaimedPush[];
  result.claimed = jobs.length;

  for (const job of jobs) {
    const text = pushText(job.template, job.data ?? {}, job.locale);
    const payload = JSON.stringify({ ...text, tag: job.tag ?? `${job.template}:${job.job_id}` });
    let retry = false;
    for (const device of job.devices) {
      try {
        // Kept by the push service for a day if the phone is off.
        await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, { TTL: 86_400, timeout: 10_000 });
        result.sent += 1;
        await supabase.rpc("touch_push_subscription", { p_endpoint: device.endpoint });
      } catch (failure) {
        const status = (failure as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          result.forgotten += 1;
          await supabase.rpc("forget_push_subscription", { p_endpoint: device.endpoint });
        } else {
          retry = true;
          console.error("A push could not be sent", status ?? "no answer");
        }
      }
    }
    if (retry) {
      result.failed += 1;
      await supabase.rpc("fail_background_job", { p_job_id: job.job_id, p_error: "PUSH_FAILED", p_retry: true });
    } else {
      await supabase.rpc("complete_background_job", { p_job_id: job.job_id });
    }
  }
  return result;
}

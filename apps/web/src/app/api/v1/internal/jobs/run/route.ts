import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runEmailJobs } from "@/modules/background-jobs/email-worker";
import { runPushJobs } from "@/modules/push/server";

const fail = (status: number, code: string) => NextResponse.json({ error: { code, message: code, details: {} } }, { status });
const digest = (value: string) => createHash("sha256").update(value).digest();

// Called by the host's scheduler on a short interval (ADR-0002). It stays off until
// JOBS_WORKER_SECRET is set, and that secret is the only way in.
export async function POST(request: Request) {
  const secret = process.env.JOBS_WORKER_SECRET;
  if (!secret) return fail(503, "WORKER_NOT_CONFIGURED");

  const given = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) return fail(401, "NOT_AUTHORIZED");

  try {
    // Emails, then phone notifications (Q-66).
    return NextResponse.json({ data: { ...(await runEmailJobs()), push: await runPushJobs() } });
  } catch {
    console.error("Email jobs failed to run");
    return fail(500, "GENERIC");
  }
}

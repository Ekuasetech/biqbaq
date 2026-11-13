// On your own computer, sends waiting emails while `npm run dev` is running, so no scheduler
// is needed. It only runs against a local database with a test address set, which sends
// every email to that one address. Elsewhere, the scheduler calls /api/v1/internal/jobs/run.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  if (!process.env.EMAIL_TEST_RECIPIENT) return;
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) return;

  // Reloading in development runs this again, and only one timer should exist.
  const state = globalThis as typeof globalThis & { biqbaqEmailWorker?: ReturnType<typeof setInterval> };
  if (state.biqbaqEmailWorker) return;

  const { runEmailJobs } = await import("@/modules/background-jobs/email-worker");
  const { runPushJobs } = await import("@/modules/push/server");
  let running = false;
  state.biqbaqEmailWorker = setInterval(() => {
    if (running) return;
    running = true;
    runEmailJobs()
      .catch(() => console.error("Email jobs failed to run"))
      // Phone notifications too (Q-66).
      .then(() => runPushJobs())
      .catch(() => console.error("Push jobs failed to run"))
      .finally(() => {
        running = false;
      });
  }, 10_000);
}

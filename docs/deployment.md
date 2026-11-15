# Deploying Biqbaq (web app on Render, database on Supabase)

The owner chose Render for the web app (2026-11-13, Q-11). Keys and secrets never go in the
code or in this file: they are typed into Supabase's, Render's and each provider's own settings.

## 1. The real Supabase project

1. Create the project in the Supabase dashboard (region: Canada, if offered), and keep its
   database password somewhere safe.
2. On the development machine, in the repository folder:
   - `npx supabase login` (opens the browser to sign in).
   - `npx supabase link --project-ref <the project's reference>` (asks for the database password).
   - `npx supabase db push --dry-run` lists the migrations that would be applied. Nothing changes.
   - `npx supabase db push` applies them, only once the owner approves.
   `supabase/seed.sql` (the demo shops) is never sent by `db push`.
3. After linking, `supabase/.temp/project-ref` exists. Remove the link (`npx supabase unlink`)
   when done, so later local commands cannot reach the real project by mistake.
4. In the dashboard:
   - Authentication > Sign In / Providers: email confirmation on; Google on, with its client ID
     and secret, and the Google console's redirect address set to the one Supabase shows.
   - Authentication > URL Configuration: Site URL `https://<domain>`, and redirect URLs
     `https://<domain>/**`.
   - Authentication > Hooks: Send Email hook to `https://<domain>/api/v1/auth/email-hook`;
     its secret goes in Render as `SEND_EMAIL_HOOK_SECRET`.
5. Once the owner has signed up on the live site and confirmed their email, make them Super
   Admin in the SQL editor: `select private.bootstrap_super_admin('<owner's email>');`
6. Super Admin then sets Biqbaq's mailing address on the Email lists page (needed in every
   list email, CASL), and checks Platform settings.

## 2. The web app on Render

- A Web Service from the GitHub repository, branch `frontend-preview` (or the branch chosen
  for production), Node 22 or newer.
- Build command: `npm ci && npm run build --workspace apps/web`.
  Start command: `npm run start --workspace apps/web`.
- A paid instance avoids the free plan's sleep after idle time, which makes the first visit slow.
- Environment variables (names only; values from each provider):
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`,
  `EMAIL_FROM`, `EMAIL_LIVE_SENDING=true`, `EMAIL_TEST_RECIPIENT` (blank),
  `SEND_EMAIL_HOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JOBS_WORKER_SECRET`
  and `CONTACT_HASH_SECRET` (long random values), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a new pair for production).
  `EMAIL_LOCAL_INBOX_URL` is for the local copy only and is not set.
- The domain is `biqbaq.com` (confirmed 2026-11-14): add `biqbaq.com` and `www.biqbaq.com` to the
  service in Render (Settings > Custom Domains) and create the DNS records Render shows at the
  registrar. Once it is verified, `<domain>` in this file means `biqbaq.com`, and
  `NEXT_PUBLIC_SITE_URL` becomes `https://biqbaq.com`.

## 3. The email and notification sender

Emails, blog emails and phone notifications wait in a queue until the worker sends them. Call
`POST https://<domain>/api/v1/internal/jobs/run` with the header
`Authorization: Bearer <JOBS_WORKER_SECRET>` every minute. Without it, nothing is emailed
(sign-up and password emails are the exception: the auth hook sends them straight away).

The owner chose Supabase Cron over a paid Render Cron Job (2026-11-15). Set up in the
dashboard, not in migrations, because the job holds the secret:
- Integrations > Cron: enable (with `pg_net`).
- Job `biqbaq-email-sender`: schedule `* * * * *`, type HTTP Request, `POST` to the URL
  above, header `Authorization: Bearer <JOBS_WORKER_SECRET>`, empty body.
- Optional job `clean-cron-history`: `0 4 * * *`, SQL
  `delete from cron.job_run_details where end_time < now() - interval '7 days';`
- To check it, run `select created, status_code, content from net._http_response order by created desc limit 5;`
  in the SQL editor. Each row should show 200.
If `JOBS_WORKER_SECRET` changes in Render, change the job's header too.

## 4. Providers' webhooks

- Stripe: `https://<domain>/api/v1/payments/stripe/webhook` (live or test mode, matching the keys).
- Resend: bounces and complaints to `https://<domain>/api/v1/email/events`, and the sending
  domain verified in Resend.

## 5. After the first deploy

- Check that rate limits see each visitor's own internet address behind Render's proxy (Q-27).
- Sign up, confirm the email, publish a test product and a test blog post (box unticked), and
  run a Stripe test payment, before announcing the site.

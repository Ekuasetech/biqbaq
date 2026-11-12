# Biqbaq

A marketplace for Nigerians in Canada (Canada only for now, see ADR-0005): products, vehicle shipping and shared cargo opportunities, and seller tools, on web (Next.js) and mobile (React Native / Expo) with one Supabase backend.

**Status:** early development, running against a local Supabase copy only. Accounts, roles, seller shops and products use the database. Vehicles, blog and ads still use sample data.

## Run the web app

```sh
npm install
npm run dev -w web      # http://localhost:3000
npm test -w web         # unit tests
npm run test:e2e -w web # browser tests (run `npm run build -w web` first)
```

On this computer, two scripts run everything the same way each time:

```sh
scripts/test-e2e-local.sh            # build, lint, secret check, browser tests on port 3100, then remove test data
scripts/test-e2e-local.sh -g "about" # only the tests whose names match
scripts/test-db-copy.sh              # every database test, on a throwaway copy of the local database
```

They never touch your own local accounts: `scripts/clean-test-data.sql` removes only test addresses (`name-<digits>-<digits>@example.com`). Logs go to a temporary folder, printed at the end.

Accounts need the local Supabase copy, which needs Docker running:

```sh
npx supabase start               # local database, sign-in service and test inbox
./scripts/use-local-supabase.sh  # points the web app at the local copy
npx supabase test db             # database and security tests
```

Local sign-up and password emails go through the web app, so it must be running on port 3000 for them to work. Real addresses are redirected to `EMAIL_TEST_RECIPIENT`, and `@example.com` addresses go to the local test inbox at http://127.0.0.1:54324.

Emails sent locally land in the test inbox at http://127.0.0.1:54324, not real inboxes.

To try the admin screens, create an account, then run `./scripts/make-local-super-admin.sh you@example.com`. This only works once per local database, and only on the local copy.

The local email sender starts with `npm run dev` and keeps the email types it started with: after adding a new kind of email, restart the dev server, or those emails fail with `UNKNOWN_TEMPLATE`.

### Payments with Stripe (test mode)

Use a Stripe account kept only for Biqbaq, in test mode or a sandbox, with Connect switched on. Put its `STRIPE_SECRET_KEY` (`sk_test_...`) in `apps/web/.env.local`, then forward Stripe's notices to the app and put the secret it prints in the same file as `STRIPE_WEBHOOK_SECRET`:

```sh
stripe login                     # choose the Biqbaq account
stripe listen --print-secret     # the whsec_ value
stripe listen --forward-to localhost:3000/api/v1/payments/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,refund.created,refund.updated,charge.refund.updated,charge.dispute.created,charge.dispute.updated,charge.dispute.closed,account.updated
```

A seller's Stripe sign-up has a CAPTCHA, so it is done by hand: Super Admin turns payments on for the shop, then its owner clicks **Set up payments with Stripe** and uses Stripe's test shortcuts. Then `STRIPE_LIVE=1 STRIPE_SECRET_KEY=... npx playwright test -g "live Stripe"` (with `STRIPE_LIVE_SHOP` set to the shop's slug, `albert` by default) pays by test card, and checks the order, Biqbaq's service fee on Stripe's side, and a refund. Forward to the port the test uses.

Real project settings belong in `apps/web/.env.local`, copied from `.env.example`. On this computer the generated local files override it, so development and tests cannot touch the real project. Never commit real keys.

## Where to start

- [Product requirements](docs/product-requirements.md): the requirements baseline.
- [System architecture](docs/system-architecture.md): how the system fits together.
- [Open questions](docs/decisions/open-questions.md): decisions still needed.
- [CLAUDE.md](CLAUDE.md): working rules for AI-assisted development.

## Layout

| Path | Contents |
| --- | --- |
| `apps/web` | Next.js web app, and the trusted server API |
| `apps/mobile` | React Native (Expo) app |
| `packages/*` | Shared types, validation, domain contracts, API client |
| `supabase/` | Migrations, functions, seed data, database tests |
| `docs/` | Requirements, design docs, decision records |

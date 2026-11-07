# Implementation Roadmap

Status: **proposed, awaiting review**. Phases follow PRD §26. One slice at a time, each reviewed and meeting the Definition of Done (§28.4) before the next.

Questions referred to are in [open-questions.md](decisions/open-questions.md).

## Build order note

At the project owner's direction (2026-11-05), public web pages are being built first, on sample data behind `modules/product-catalog`. These pages are **not done** under §28.4 until the backend replaces the sample data. Each module's `sample-data.ts` and the preview banner are removed at that point. The contact and account forms validate only, and send nothing, until they are connected.

The public pages are now built: home, products, cargo cars, blog, seller profiles, ads, account forms and draft legal pages. Dashboards wait for the backend, because they depend on real sign-in and permissions.

Known limitation: an unknown product URL shows the not-found page and a `noindex` tag, but responds with HTTP 200, because the response has already started streaming. Unknown non-product URLs do respond 404. Decide when the backend is connected whether to add a check in Proxy for a true 404, at the cost of a database lookup on those requests.

## Before Phase 1

- [ ] Project owner reviews the design docs, especially the database and security design (§28.3).
- [ ] Docker (or equivalent) installed for local Supabase.
- [ ] Supabase project created.

## Phase 1: Foundation

1. npm workspaces, strict TypeScript, ESLint, Vitest.
2. `apps/web`: Next.js App Router, Tailwind, shadcn/ui, `next-intl` (en, fr), light and dark themes, logo.
3. `apps/mobile`: Expo foundation, confirmed to resolve shared packages (ADR-0004).
4. Shared packages with stub exports; type generation from the database.
5. Supabase CLI, migration workflow, and pgTAP runner, including the check that all tables have RLS.
6. CI: type check, lint, unit tests, database tests.

**Done when:** both apps run and use a shared package, and a sample migration and RLS test pass in CI.

## Phase 2: Identity, roles, authorization

Needs: Q-01, Q-02, BD-09, BD-17 (BD-18 has an interim rule).

1. Roles, permissions, audit and settings tables; helper functions; signup trigger.
2. Registration, login, email verification, password reset, on web.
3. Role application RPCs, and the applicant's page.
4. Super Admin: Role Applications dashboard (§4.5), role suspension.
5. Admin permission assignment; protected dashboards and the role switcher.
6. Platform Configuration page (basic), audit log viewer.

**Built, for item 6:** Super Admin's Platform settings and Audit log screens, on the local copy. Settings cover only what works today (publishing, notification emails, Contact Seller limits, product photos), each with its own limits, a required reason and history. Feature switches for reviews, referrals, payments and others are added with those features.

**Built, for items 4 and 5:** Super Admin's People and roles screen, on the local copy: find anyone, give a role, change an Admin's or Co-admin's permissions, and suspend, restore or remove a role, with a reason, audit and an email to the person. Not built: an Admin's own screen for delegating to a Co-admin (the database supports it), suspending a whole account, and creating a marketer who has no account yet.

## Phase 3: Sellers and marketplace

Needs: Q-03, Q-06, Q-08, Q-09, Q-12, BD-08, BD-10, BD-14, BD-16.

1. Seller dashboard and profile.
2. Staff invitations, memberships and permissions.
3. Categories, product CRUD (drafts), Cloudinary uploads.
4. `publish_product` and its concurrency tests.
5. Verification states and the manual verification flow.
6. Public marketplace, search, categories, product page, Unverified Seller label, sharing.
7. Reviews and favourites.
8. On-behalf actions for admins and co-admins.

Progress at 2026-11-06, on the local copy only:

- **Built:** a shop created on approval; the seller's "My shop" screen with drafts, editing, publishing, unpublishing and deleting; `publish_product`, with the limit, the permanent ledger and edit logging; moderation and on-behalf database functions, with no screens yet; public product, seller and search pages reading the database.
- **Built, with Cloudinary:** signed product photo uploads. Local work stores files in a separate `biqbaq-local` folder. Known limit: someone who uploads a file and never finishes leaves an unused file in Cloudinary, so a clean-up job is needed once background jobs exist. Deleting a product also keeps its files for now.
- **Built, for verification:** a seller's request on My shop, and the Super Admin screen to approve, reject, suspend, restore and revoke, with history and audit. Requests are written notes, with no document uploads (BD-16), and the seller only sees decisions on screen until emails are built.
- **Built, for shop details:** sellers edit their name, city, category, description and private contact details on My shop, through the audited `update_my_shop`. The shop's web address never changes, and logos are not built yet. The public page usually updates straight away, but one full test run showed it can lag by up to about a minute if the page was being cached at that moment.
- **Built, for moderation:** the Moderation screen, for Super Admin and Admins with `products.moderate`, `sellers.manage` or `sellers.publishing`, each seeing only what their permission allows. It suspends and restores products, shops and publishing with a required reason. Each action is audited, and the seller is emailed the reason. Screens for on-behalf actions and a shop's allowance are not built.
- **Not built:** staff, identity provider, reviews, favourites, and view counting (Q-16). Vehicles, blog and ads still use sample data, until their own phases.
- `supabase/seed.sql` holds invented shops for local use. `supabase db push` does not load it, so it never reaches the real project.
- Public pages can show old data for about a minute if a page is being cached at the moment of a change. The seller's and moderator's screens refresh them immediately otherwise.
- `scripts/test-publish-race.sh` proves the limit holds when two publishes overlap. Run it after changing `publish_product`.

The owner decided that publishing does not need a verified contact email (Q-06), so this phase no longer depends on Phase 4.

## Phase 4: Communication

Needs: BD-04, BD-05, Q-10, Q-13.

1. `background_jobs`, the worker and `EmailService` with Resend are **built**, and send the decision emails below. The Auth email hook is **built** on the local copy, so sign-up and password emails go through `EmailService` too.
2. Send enquiries to the seller's login email, which is already verified (Q-06). **Built.**
3. Anonymous contact form. **Built** for products; cargo cars follow once they use real data.
4. Messaging, inbox and Realtime.
5. In-app notifications and preferences.

**Built, for email:** new accounts get a confirmation email, and a welcome email once confirmed. Super Admin is emailed about new role applications. Applicants are emailed about approvals and rejections, and sellers about verification changes. Still to come: a Super Admin screen for the on/off setting (`email.notifications_enabled`, PRD §18.2) and for failed jobs, and a production scheduler (Q-11).

## Phases 5 to 12

As PRD §26. These need answers first:

| Phase | Scope | Needs |
| --- | --- | --- |
| 5 | Public seller API | None |
| 6 | Blog, advertising | BD-15 |
| 7 | Payments | BD-02, BD-03, BD-12 |
| 8 | Marketers, referrals | BD-11, Q-07 |
| 9 | Vehicles and cargo | BD-01, Q-04, Q-05 |
| 10 | Integrations | BD-06, BD-07, BD-13; terms checks for each source |
| 11 | Mobile app | Web features established |
| 12 | Hardening and launch | Q-11 |

Mobile: Phase 11 builds the app's screens, but Phases 2 to 10 must stay mobile-ready by keeping rules behind RPCs and `/api/v1`, so no feature relies on server actions alone.

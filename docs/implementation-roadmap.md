# Implementation Roadmap

Status: **proposed, awaiting review**. Phases follow PRD §26. One slice at a time, each reviewed and meeting the Definition of Done (§28.4) before the next.

Questions referred to are in [open-questions.md](decisions/open-questions.md).

## Build order note

At the project owner's direction (2026-11-05), public web pages are being built first, on sample data behind `modules/product-catalog`. These pages are **not done** under §28.4 until the backend replaces the sample data. `sample-data.ts` and the preview banner are removed at that point. The contact form validates only, and sends nothing, until Phase 4.

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

Roadmap note: `publish_product` depends on contact email status (Q-06), which is built in Phase 4. Contact email verification moves to the start of step 4 in this phase if Q-06 is confirmed as the assumption states, and needs `EmailService` then.

## Phase 4: Communication

Needs: BD-04, BD-05, Q-10, Q-13.

1. `background_jobs`, the worker, `EmailService` with Resend, and Auth email hook.
2. Seller contact email verification (if not already done in Phase 3).
3. Anonymous contact form.
4. Messaging, inbox and Realtime.
5. In-app notifications and preferences.

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

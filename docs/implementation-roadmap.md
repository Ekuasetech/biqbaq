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
- **Built, for staff:** a seller invites someone by email and ticks what they can do. The person accepts by signing in with that address, then the seller approves them, which gives the Seller Staff role (Q-32). Staff work from the shop screen within their permissions, and their actions are audited with owner and actor distinct. Sellers can change, suspend or remove staff. Only product and staff permissions are offered for now, as conversations, orders and analytics are not built.
- **Built, for reviews and favourites:** buyers review a product once, and can edit or delete it, but not their own shop's products. Moderators hide or show reviews with a reason. Signed-in people save favourites, listed on their account page. Super Admin switches both on or off.
- **Not built:** identity provider, (view counting is **built** for products: Q-16). Vehicles, blog and ads still use sample data, until their own phases.
- `supabase/seed.sql` holds invented shops for local use. `supabase db push` does not load it, so it never reaches the real project.
- Public pages can show old data for about a minute if a page is being cached at the moment of a change. The seller's and moderator's screens refresh them immediately otherwise.
- `scripts/test-publish-race.sh` proves the limit holds when two publishes overlap. Run it after changing `publish_product`.

The owner decided that publishing does not need a verified contact email (Q-06), so this phase no longer depends on Phase 4.

## Phase 4: Communication

Needs: BD-04, BD-05, Q-10, Q-13.

1. `background_jobs`, the worker and `EmailService` with Resend are **built**, and send the decision emails below. The Auth email hook is **built** on the local copy, so sign-up and password emails go through `EmailService` too.
2. Send enquiries to the seller's login email, which is already verified (Q-06). **Built.**
3. Anonymous contact form. **Built** for products; cargo cars follow once they use real data.
4. Messaging, inbox and Realtime. **Built** on the local copy (2026-11-08): signed-in people message a shop from a product, cargo car or shop page; one inbox for buying and selling, with unread counts, live delivery, closing and archiving; staff see or answer with `messages.view` or `messages.respond`; one email an hour at most per conversation; Super Admin reads only with an audited reason (Q-34 to Q-37). Senders see Sent or Read on their messages, live (owner's request, 2026-11-08); for a shop, anyone there with message access reading counts. Signing in now returns people to the page they came from.
5. In-app notifications and preferences. **Built** on the local copy (2026-11-08): a bell in the header with a live unread count, a notifications page, and email preferences for messages and staff (Q-38 to Q-40). SMS (§18.3) waits for a provider.
6. Customer email lists and bulk email, added by the owner (2026-11-08). **Built** on the local copy: off for every shop until Super Admin turns it on; confirmed opt-in lists; one bulk email a day to at most 100 people; Biqbaq's own list for Super Admin; confirm and unsubscribe pages and one-click unsubscribe (Q-42 to Q-47).
8. Dashboard redesign (Q-56), owner's request (2026-11-08). **Step 1 built:** account and admin pages moved into their own route group with a sidebar (only what each person can open, from `my_dashboard()`) and top bar; the account page opens on an Overview with number cards and recent messages and notifications. **Step 2 built:** My shop is seven pages, listed under My shop in the sidebar for owners and as tabs for staff. **Step 3 built:** the top bar's search (`search_my_things`), with results grouped by kind and each leading to its page.
7. Client details and invoices or receipts, added by the owner (2026-11-08). **Built** on the local copy: a client table (name, email, optional phone, and whether to ask them to join bulk email); a separate page to write an invoice or receipt with items and the seller's own tax lines, preview it as a PDF and email it with the PDF attached; download or send again from My shop (Q-48 to Q-52). Changed the same day (Q-53 to Q-55): adding clients sends no email, ticked clients receive updates at once on the seller's word that they are existing customers, sellers can email one client or all, and a shop's bulk email pauses itself on spam complaints, unsubscribes or bounces. The PDFs are made on Biqbaq's own server with pdf-lib (MIT). The built-in fonts cover English and French; other accented letters lose their accent.

**Built, for email:** new accounts get a confirmation email, and a welcome email once confirmed. Super Admin is emailed about new role applications. Applicants are emailed about approvals and rejections, and sellers about verification changes. Still to come: a Super Admin screen for the on/off setting (`email.notifications_enabled`, PRD §18.2) and for failed jobs, and a production scheduler (Q-11).

## Phases 5 to 12

As PRD §26. These need answers first:

| Phase | Scope | Needs |
| --- | --- | --- |
| 5 | Public seller API | None. **Built** on the local copy (2026-11-07), with each shop's address and notes for its developer on My shop |
| 6 | Blog, advertising | **Built** on the local copy (2026-11-07): the blog with the Tiptap editor and comments, and ads, managed by Super Admin and permitted Co-admins. Ads offer the two places the site has (home page, every other page); header, sidebar, product listing and mobile spots wait for somewhere to appear. The frequency control is a per-section limit; per-visitor caps would need visitor tracking |
| 7 | Payments | **Built on the local copy (2026-11-08), and tested live against Stripe's test mode:** a seller's Stripe sign-up (by hand, as it has a CAPTCHA), a test-card payment marked paid by Stripe's notice, Biqbaq's CA$1 on the seller's charge, and a refund recorded from Stripe's notice. Before launch, recheck the Accounts v2 version (Stripe now documents `2026-10-28.endive`; Biqbaq sends `2026-10-28.preview`). Built: Stripe Connect in CAD with direct charges (BD-12), Express-dashboard sellers on Accounts v2 with Stripe responsible for losses (a Stripe preview), Biqbaq's service fee (CA$1 by default, set by Super Admin) paid by the buyer on top of the price, kept on refunds (BD-02), one product per order with Stripe collecting the delivery address and phone (BD-03). Super Admin turns payments on per shop; a shop takes payments only when Stripe confirms it. Seller Orders page (deliver, refund), buyer Orders page, Super Admin Payments screen. Orders are marked paid only from Stripe's signed notices |
| 8 | Marketers, referrals | **Built** on the local copy (2026-11-08): codes and links for marketers and every shop, a 30-day latest-link rule (BD-11), credit once the email is confirmed (Q-07), separate marketer and shop dashboards, and a Super Admin screen to see programmes and change codes (Q-41). Marketers are approved through role applications or given the role on the People screen. No rewards or payouts are built: the PRD asks only for tracking |
| 9 | Vehicles and cargo | **Built** on the local copy (2026-11-07): verified sellers list cargo cars with photos, weight capacity and restrictions; the public sees trips that have not left, from verified sellers; Contact Seller goes to the dealer; views count; moderators suspend with `vehicle_listings.moderate`. Sale listings (BD-01) are not built |
| 10 | Integrations | BD-06, BD-07, BD-13; terms checks for each source |
| 11 | Mobile app | Web features established. **Before it (owner's request, 2026-11-11, Q-61):** make the website an installable web app (PWA) so phone users get an app-like Biqbaq: a web app manifest (name, short name, Biqbaq icons including a maskable one and an Apple touch icon, navy theme colour, standalone display, start page), a small service worker that only shows a friendly offline page (it caches no account, payment or private data), and an install hint (Android's install prompt; on iPhone, a short note on Safari's Share, then Add to Home Screen). Push notifications through the PWA are a later step. Whether the Expo app comes before or after launch is still open (Q-61) |
| 12 | Hardening and launch | Q-11 |

Installable web app (PWA): planned before launch (Q-61); it reuses the website as it is, so it needs no separate screens.

Mobile: Phase 11 builds the app's screens, but Phases 2 to 10 must stay mobile-ready by keeping rules behind RPCs and `/api/v1`, so no feature relies on server actions alone.

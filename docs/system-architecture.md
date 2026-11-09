# System Architecture

Status: **proposed, awaiting review**. Requirements: [product-requirements.md](product-requirements.md) (PRD). IDs like `BD-03` and `Q-01` refer to [open-questions.md](decisions/open-questions.md); `ADR-0001` etc. are in [decisions/](decisions/).

## 1. Overview

Biqbaq is a modular monolith: two clients, one trusted server API, one database.

```
  Web browser      Independent seller sites       Mobile app (Expo)
       |                     |                     |         |
       | pages, API          | public GET only     | /api/v1 |
       v                     v                     |         |
 +-------------------------------------------+     |         |
 | apps/web (Next.js)                        |<----+         |
 |  pages, dashboards, /api/v1/*, webhooks,  |               |
 |  domain modules                           |               |
 +--------------------+----------------------+               |
                      |                                      |
                      |        RLS reads, Auth, Realtime     |
                      v                                      v
 +---------------------------------------------------+
 | Supabase                                          |
 |  Auth | PostgreSQL + RLS + RPC functions          |
 |  Realtime | Private Storage (verification docs)   |
 +---------------------------------------------------+
             ^
             | claims and runs jobs
 +-----------+-------------+     Cloudinary, Resend, SMS provider,
 | Job worker              |---> payment providers, IRCC / jobs /
 +-------------------------+     FX / weather sources
```

## 2. Where logic lives (ADR-0001)

The PRD requires web and mobile to share one set of rules, and mobile cannot call Next.js server actions. So each kind of rule has one home:

| Layer | Holds | Examples |
| --- | --- | --- |
| **PostgreSQL**: RLS and RPC functions | Who can see or change a row; invariants that must hold in one transaction | Publication allowance, role approval, audit writes, referral uniqueness |
| **Server API**: `apps/web` `/api/v1/*`, calling `modules/*` | Anything needing a secret or an external provider | Cloudinary signing, Resend, payments, webhooks, public seller API, FormSubmit sign-up notices (Q-57) |
| **Shared packages** | Contracts, not authority | Zod schemas, types, permission names, API client |
| **Clients** | Presentation; UX-only checks | Hiding a button the backend would refuse anyway |

Client access rules:

- **Reads:** clients may query Supabase directly under RLS. Public data comes from restricted views exposing approved fields only.
- **Simple owner-scoped writes** (favourites, profile edits, product content) may go directly through RLS.
- **Workflow writes** (publish, approve, verify, suspend, staff changes) must go through an RPC or `/api/v1`. RLS denies direct changes to status columns.
- **Service-role key:** server API and worker only.

## 3. Key flows

**Publishing a product.** Client calls `publish_product(product_id)`. In one transaction, the function locks the seller row, checks the platform toggles, seller state, product completeness and allowance, writes the first-publication ledger row, sets the status, writes the audit entry, and enqueues cache invalidation. See [workflows.md](workflows.md).

**Image upload (PRD §17).** Client validates format and size, then asks `/api/v1/media/sign`. The server checks ownership and limits from `platform_settings`, and returns a signed Cloudinary upload. Client uploads, then reports the result. The server fetches the asset's real size, format and dimensions from Cloudinary, deletes it if it breaks the limits, and only then saves metadata. This is the real enforcement; the browser check is UX only. Photos are always redrawn in the browser, which removes hidden details such as GPS location. Exact Cloudinary options get confirmed against its docs in Phase 3.

**Live messaging.** Messages are stored in PostgreSQL under RLS. Clients subscribe through Supabase Realtime, which applies the same participant rules.

**Public seller API.** `GET /api/v1/sellers/{sellerSlug}/products` reads a restricted view, with pagination, rate limiting and cache tags. A product change invalidates its seller's tag. Every item carries its canonical Biqbaq URL. See [api-specification.md](api-specification.md).

**Payments (Phase 7).** A provider-independent `PaymentProvider` interface covers onboarding, checkout, webhook verification and refunds. Webhooks are stored by provider event ID before processing, so retries are harmless. Provider choice waits on BD-12.

## 4. Cross-cutting decisions

| Concern | Decision |
| --- | --- |
| Authorization data | Looked up in the database on each request, not stored in the JWT, so suspension applies immediately (ADR-0003) |
| Background jobs | PostgreSQL job table with `FOR UPDATE SKIP LOCKED`, behind a replaceable interface (ADR-0002) |
| Rate limiting | PostgreSQL-backed counters at first, behind an interface; no Redis (PRD §28.1) |
| Email | All sending goes through one `EmailService`, including Supabase Auth emails via its Send Email hook, so verification and reset emails use Resend and shared templates |
| Sensitive documents | Private Supabase Storage bucket with short-lived signed URLs, never Cloudinary |
| Configuration | `platform_settings` table with audit history; read by database functions and server code |
| Localization | `next-intl` on web, using `/[locale]/` routes. Seller content is not translated. Canonical product URLs must stay stable, so they use the default locale |
| Deletion | Business records are soft-deleted, so allowance, audit and order history survive |
| Monorepo tooling | npm workspaces (ADR-0004) |
| Long lists | Every list that can grow is read a page at a time (usually 20; at most 100 or 200 per call), and the database returns how many there are in all as `total` with each row, or as the PostgREST `count`. The web app shows them with the shared `Pager` (Previous, "Page 1 of 3", Next). A dashboard search result that names an item on a later page moves through the pages to find it |

## 5. Hosting

The PRD does not name a host for the Next.js app or worker. ADR-0002's worker design works on any host with a scheduler. Needs a decision before launch (Q-11), but does not block the design.

## 6. Environments

| Environment | Purpose |
| --- | --- |
| Local | Supabase CLI in Docker. Needed to run migrations and RLS tests |
| Staging | Separate Supabase project and provider sandbox keys |
| Production | Separate project; migrations are applied only from version control |

Secrets are held in environment variables. Only `.env.example` files are committed, and only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` values (Supabase URL and anon key) may reach clients.

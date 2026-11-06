# Module Boundaries

Status: **proposed, awaiting review**.

Modules live in `apps/web/src/modules/`. PRD §22.4 suggests 30 and warns against unnecessary structure, so this groups closely related ones. A module gets its own folder when its phase arrives.

## Rules

1. Other code imports a module only through its `index.ts`. An ESLint rule enforces this.
2. Modules do not import from `app/` or UI components.
3. Dependencies follow the diagram below, and cycles are not allowed. Where a lower module needs to react to a higher one, use a queued job.
4. Each table has one owning module, the only one that writes to it.
5. Sensitive actions call `audit` in the same transaction, usually inside the RPC.

## Dependency map

```
 Features    product-catalog  vehicle-marketplace  messaging  seller-contact
             public-store-api  blog  advertising  payment-management  orders
             reviews  favourites  referral-tracking  marketer-management
             integrations  immigration-updates  analytics  administration
                                   |
                                   v
 Sellers     seller-management  staff-management  verification
                                   |
                                   v
 Access      role-management  ->  authorization  ->  identity
                                   |
                                   v
 Platform    platform-configuration  audit  notifications  media-management
             background-jobs  email (inside notifications)
```

## Ownership

| Module | Owns | Phase |
| --- | --- | --- |
| `identity` | profiles, session helpers | 2 |
| `authorization` | roles, permissions, grants, permission checks | 2 |
| `role-management` | role applications, user_roles changes | 2 |
| `audit` | audit_logs | 2 |
| `platform-configuration` | platform_settings and history | 2 |
| `seller-management` | sellers, seller_private | 3 |
| `staff-management` | invitations, memberships, staff permissions | 3 |
| `verification` | verification requests, evidence and history, including manual review | 3 |
| `product-catalog` | categories, products, ledger, publish rules | 3 |
| `media-management` | media_assets, Cloudinary signing | 3 |
| `reviews`, `favourites` | their tables | 3 |
| `notifications` | notifications, preferences, `EmailService`, SMS interface | 4 |
| `background-jobs` | background_jobs, `JobQueue`, worker | 4 |
| `seller-contact` | enquiries | 4 |
| `messaging` | conversations, messages | 4 |
| `public-store-api` | public seller endpoints and contract | 5 |
| `search` | no tables; reads other modules' public data for suggestions | 3 |
| `blog` | posts, revisions, moderation | 6 |
| `advertising` | advertisements | 6 |
| `payment-management` | provider accounts, webhooks, commission rules | 7 |
| `orders` | orders, transactions | 7 |
| `marketer-management` | marketer lifecycle | 8 |
| `referral-tracking` | codes, attributions | 8 |
| `vehicle-marketplace` | vehicle listings **and** cargo opportunities | 9 |
| `integrations` | snapshots; jobs, FX, weather **and** immigration updates | 10 |
| `analytics`, `administration` | reporting views and admin aggregation; no business rules | as needed |

Merged from the §22.4 list: `cargo-management` into `vehicle-marketplace` (a cargo opportunity has no meaning without its vehicle); `email-verification` into `seller-contact`; `immigration-updates` into `integrations`. Any of these can split later.

## Shared packages

| Package | Contains | Must not contain |
| --- | --- | --- |
| `shared-types` | Types generated from the database, API response types | Logic |
| `validation` | Zod schemas used by both clients and the server | Secrets, I/O |
| `domain-contracts` | Permission keys, status values and allowed transitions, error codes | Authorization decisions |
| `api-client` | Typed client for `/api/v1` | Service-role access |

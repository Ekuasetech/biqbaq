# Security Architecture

Status: **approved by the owner (2026-11-06)**. Covers authentication, authorization and the RLS design (PRD §5, §23, §24.1).

## 1. Authentication

- Supabase Auth for registration, login, email verification, password reset and sessions, on web (HTTP-only cookies via `@supabase/ssr`) and mobile (tokens in `expo-secure-store`).
- Verification and reset emails use Supabase's Send Email hook, which calls `EmailService` and so Resend.
- Google sign-in (Q-18) also goes through Supabase Auth, and a verified email with the same address means the same account, as one person has one account (§3.1).
- A signup trigger creates the profile and the active `buyer` role, and records referral attribution. It treats signup metadata as untrusted: it reads only a referral code, and looks the code up. An error in this trigger would block all signups, so a bad or missing referral code must never raise one.
- Suspended or deactivated accounts: `profiles.status` is checked by the authorization helpers, so a still-valid session cannot act. The account is also banned in Supabase Auth so that it can no longer log in.

## 2. Authorization helpers

Located in a `private` schema that the API does not expose, `SECURITY DEFINER`, with a fixed `search_path`:

| Function | True when |
| --- | --- |
| `has_active_role(role)` | Account active, and this role's assignment is `active` |
| `has_permission(perm)` | Account active, and an active role grants `perm`, or Super Admin |
| `is_seller_member(seller)` | Caller is the active owner, or active staff with the `seller_staff` role active |
| `has_seller_permission(seller, perm)` | Owner, or active staff with that permission and the `seller_staff` role active |
| `can_access_conversation(conv)` | Buyer, or a seller member with `messages.view` |
| `can_reply_to_conversation(conv)` | Buyer, or a seller member with `messages.respond` |

These helpers need `EXECUTE` granted to `authenticated`, because policies run as the caller. That does not expose them to the API, because the `private` schema is not exposed. Signed-out visitors read only through public views, so `anon` has no access to `private`, and can run no function in `public`. PostgreSQL opens new functions to everyone by default, and a per-schema default cannot change that, so each migration must revoke access to its own new functions. A database test fails if any function is left open. `record_product_image` can only be run by the server, using the secret key.

The `seller_staff` role check is what enforces §3.6: suspending the platform role or the membership each cuts access on its own. Same for owners: a suspended `seller` role removes access to seller management but leaves the records intact.

## 3. Privilege protection

- Writes to `user_roles`, grants and applications are denied to clients. They happen only through RPCs that check the caller.
- **Only Super Admin** can approve applications, assign admin permissions, or suspend roles.
- `super_admin` cannot be requested or granted through normal RPCs. A trigger rejects changes to Super Admin assignments unless the actor is a Super Admin, and rejects removing the last active one (Q-02).
- **No escalation:** an Admin delegating to a Co-admin can grant only permissions that they hold themselves and that are marked `is_delegable` (BD-09).
- Approval of a role never copies grants. Admin starts with none.

## 4. RLS summary

Default deny. Every table has RLS on, and no policy means no access.

| Data | Read | Direct write |
| --- | --- | --- |
| `profiles` | Self; admins with `users.manage` | Self, limited to safe columns |
| `user_roles`, grants | Self; Super Admin | None (RPC only) |
| `role_applications` | Applicant; Super Admin | None (RPC only, including submitting, so role-specific validation cannot be skipped) |
| `sellers` | Members; admins with `sellers.manage`. Public uses `public_sellers` | Owner, safe columns only |
| `seller_private` | Owner; `sellers.manage` | None (RPC, because changing email resets verification) |
| Staff tables | Seller members; the staff member's own row | `staff.manage` holders, via RPC |
| `products` | Members; `products.moderate`. Public uses `public_products` | Members with permission, content columns only; status changes RPC only |
| `product_publication_ledger` | Members; Super Admin | None |
| `conversations`, `messages` | `can_access_conversation` | Insert as self, with `can_reply_to_conversation`. No edits |
| `reviews` | Public via a view that shows a display name only; author sees own | Signed-in authors, own row, safe columns. `is_verified_purchase` and `status` are server only |
| `favourites` | Own rows | Own rows |
| `blog_posts` | Public via a view of published posts; author; Super Admin | Authors edit drafts and revisions. Status changes RPC only, and only Super Admin can publish seller posts |
| `notifications`, `notification_preferences` | Own rows | Own preferences; notifications are server only |
| Verification tables | Seller sees own request status; Super Admin sees everything | None (RPC only) |
| Payment tables | Seller's members with permission; authorized admins. Never provider secrets | None (server only) |
| `referral_attributions` | The referrer sees own, limited fields; Super Admin | None |
| `audit_logs` | Super Admin; holders of a permission if delegated | None; append-only |
| `platform_settings` | Public keys via a view; admins with permission | RPC only, with history |
| `advertisements` | Public sees live ads only, via a view; Super Admin sees all | **Super Admin only**, via RPC and audited. Checked with `has_active_role('super_admin')`, not a grantable permission, so it cannot be delegated to Admins or anyone else |
| `background_jobs`, `rate_limit_counters`, `payment_webhook_events` | None for clients | Server only |

**Public views:** `public_products`, `public_sellers` and similar views run with their owner's rights, which is what lets anonymous visitors read approved fields while having no access to the tables underneath. Each must be read-only with an explicit column list and its own visibility filter, and any view not meant to do this must set `security_invoker = true`.

**Column-level care:** RLS works by row, so a policy cannot stop an owner changing `verification_status` on their own seller row. These are handled by revoking `UPDATE` on those columns for client roles, with RPCs doing the change. Tests must cover it, since this is a common Supabase mistake.

**Admin access to messages:** conversations are private (§9.1). Admin access to private messages goes through a separate audited RPC, and no RLS policy grants it.

## 5. Sensitive areas

| Area | Control |
| --- | --- |
| Verification documents | Private bucket; Storage policies; short-lived signed URLs issued by an audited RPC to Super Admin only |
| Seller login email, used for enquiries (Q-06) | Stored only in `auth.users`; absent from public views, API and frontend |
| Tokens (invites) | Random, hashed at rest, expiring, single-use |
| Payment webhooks | Signature checked before parsing; dedupe by event ID; amounts confirmed with the provider |
| Uploads | Ownership check before signing; size, format and dimensions verified after upload |
| Email delivery | A real recipient needs `EMAIL_LIVE_SENDING=true` and no `EMAIL_TEST_RECIPIENT`; otherwise mail goes to the test address or is refused. Reserved test addresses never reach Resend. People's text is escaped in HTML and kept out of subjects. Only Resend's status and error name are stored |
| Anonymous contact | Validation, length limits, IP and per-seller rate limits, honeypot (Q-13), header injection blocked by the Resend API's structured fields |
| Public API | Restricted views, an explicit response schema so new columns cannot leak, rate limiting |
| Open redirects | Ad destinations are validated as `https` URLs. Referral codes are looked up, not reflected |
| Blog and description content | Sanitized on render; no raw HTML from sellers |

## 6. Audit

Actions listed in §23.3 write to `audit_logs` inside the same transaction as the change, so neither can happen without the other. On-behalf actions set both `actor_id` and `on_behalf_of_seller_id`.

## 7. Required tests

pgTAP tests in `supabase/tests`, run as each role against real policies. At minimum:

- A pending application grants nothing; suspending a role removes access at once.
- Staff of seller A cannot read seller B's products, messages or payments.
- Role approval alone gives staff no access to any seller.
- A seller cannot set their own verification status, status columns or allowance override.
- Two concurrent publish calls at the allowance limit: only one succeeds.
- An Admin cannot grant a permission they do not hold, or touch Super Admin.
- Anonymous reads cannot reach `seller_private`, drafts or suspended products.
- Audit rows cannot be changed or deleted.
- Every table in `public` has RLS on (a catalogue check, so a new table cannot miss it).
- Anonymous visitors can read the public views, but not the tables beneath them.
- Only Super Admin can create or change ads, and inactive or unscheduled ads are not public.
- A seller or staff member cannot change `view_count`, `reader_count` or `is_verified_purchase`.

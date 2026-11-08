# Database Design

Status: **approved by the owner (2026-11-06)**. No migrations exist yet. Security policies are in [security-architecture.md](security-architecture.md).

Launch scope: Canada only, in CAD (ADR-0005). `sellers.country` and `products.currency` stay in the schema so Nigeria can be added later.

Conventions: `uuid` primary keys, `timestamptz` `created_at` / `updated_at`, `snake_case`, money in integer minor units with an ISO currency code. State columns use `text` with `CHECK`, as these are cheaper to change than enums. RLS is on for every table.

## Identity and roles

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id` -> auth.users, `display_name`, `locale`, `theme`, `status` | Created by a trigger at signup. **No role column** |
| `roles` | `key`, `is_assignable_by_application` | seed: buyer, seller, seller_staff, marketer, admin, co_admin, super_admin |
| `permissions` | `key`, `description`, `is_delegable` | e.g. `products.publish_on_behalf` |
| `role_permissions` | `role_key`, `permission_key` | Defaults. Empty for admin and co_admin |
| `user_roles` | `user_id`, `role_key`, `status`, `granted_by`, `application_id`, `status_reason` | Unique (`user_id`, `role_key`) |
| `user_role_permissions` | `user_role_id`, `permission_key`, `granted_by` | Explicit grants. Tied to the assignment, so suspending the role disables them |
| `role_applications` | `applicant_id`, `role_key`, `status`, `details` jsonb, `reviewed_by`, `decided_at`, `rejection_reason` | Partial unique: one `pending` per user and role |

Effective permission = an **active** `user_roles` row, plus a matching `role_permissions` or `user_role_permissions` row.

## Sellers and staff

| Table | Key columns | Notes |
| --- | --- | --- |
| `sellers` | `owner_user_id` (unique, Q-08), `slug` (unique), `name`, `city`, `country`, `category`, `description`, `status`, `publishing_suspended`, `verification_status`, `allowance_override` | Created when a seller application is approved |
| `seller_private` | `seller_id`, `contact_information` | Split out so a public read can never include it. Enquiries go to the seller's login email (Q-06), so there is no separate contact email |
| `seller_invitations` | `seller_id`, `invitee_email`, `status`, `expires_at`, `permissions`, `invited_by` | No token: it is claimed by signing in with that confirmed address, so forwarding the email gives no access |
| `seller_staff_memberships` | `seller_id`, `user_id`, `status`, `invited_by` | Unique (`seller_id`, `user_id`) |
| `seller_staff_permissions` | `membership_id`, `permission_key` | Granular (BD-08) |

## Verification

| Table | Key columns | Notes |
| --- | --- | --- |
| `verification_requests` | `seller_id`, `method` (provider / manual), `status`, `provider`, `provider_reference`, `reason`, `reviewed_by`, `decided_at` | |
| `verification_history` | `seller_id`, `from_status`, `to_status`, `method`, `actor_id`, `reason`, `created_at` | Append-only |

## Catalogue

| Table | Key columns | Notes |
| --- | --- | --- |
| `categories` | `parent_id`, `slug`, `name_en`, `name_fr` | Subcategories via `parent_id`. Translated, as it is platform content |
| `products` | `seller_id`, `category_id`, `slug` (unique), `name`, `description`, `price_minor`, `currency`, `availability`, `condition`, `attributes` jsonb, `status`, `first_published_at`, `view_count`, `created_by`, `updated_by`, `deleted_at` | The slug is fixed at first publication to keep URLs stable |
| `product_publication_ledger` | `product_id` (unique), `seller_id`, `published_by`, `seller_verified_at_time`, `created_at` | No FK cascade; rows never removed. Indexed on `seller_id` |
| `media_assets` | `entity_type`, `entity_id`, `cloudinary_public_id`, `secure_url`, `alt_text`, `display_order`, `is_primary`, `uploaded_by` | One table for all images (§17) |
| `reviews` | `product_id`, `author_id`, `rating`, `body`, `is_verified_purchase`, `status` | Unique (`product_id`, `author_id`) (Q-09) |
| `favourites` | `user_id`, `product_id` | Composite primary key |

View `public_products`: only `published`, undeleted products of non-suspended sellers, approved fields only, including the seller's name, slug, city and verified flag. `public_sellers` works the same way. Both list their columns explicitly and never use `select *`, so a new private column cannot leak. See security-architecture.md §4 for how they bypass RLS safely.

Slugs must be unique, and real titles repeat (two 2021 Toyota Siennas), so a generated slug gets a short suffix when needed. This applies to products, vehicle listings, blog posts and ads.

## Vehicles and cargo (Phase 9)

| Table | Key columns |
| --- | --- |
| `vehicle_listings` | `seller_id`, `slug` (unique), `make`, `model`, `year`, `origin_city`, `destination_city`, `departure_date`, `available_kg` (Q-33), `restrictions` text[], `cargo_status`, `status`, `created_by`. One table: the cargo opportunity is part of the listing |
| `cargo_opportunities` | `vehicle_listing_id`, `available_capacity` (unit pending), `restrictions` text[], `status` |

## Communication

| Table | Key columns | Notes |
| --- | --- | --- |
| `conversations` | `buyer_id`, `seller_id`, `product_id`, `vehicle_listing_id`, `status` (open, closed: Q-35), `closed_by`, `closed_at`, `last_message_at`, `buyer_read_at`, `seller_read_at` (read indicators: a side's mark moves only when there is something new, and Super Admin reading never moves it) | At most one listing reference, enforced by `CHECK`; one per buyer, shop and listing (or the shop itself). Participants read it through RLS, which Realtime also uses; changes go through functions only |
| `conversation_reads` | `conversation_id`, `user_id`, `last_read_at`, `archived_at`, `last_emailed_at` | Per-user unread count, archive, and the one-email-an-hour pace (Q-34) |
| `messages` | `conversation_id`, `sender_id` (who typed it, possibly staff), `sender_side`, `body` (1 to 2,000 characters, text only: BD-04), `created_at` | Indexed on (`conversation_id`, `created_at`) |
| `contact_enquiries` | `product_id`, `seller_id`, `visitor_email_hash`, `ip_hash`, `status`, `provider_message_id`, `last_error` | Delivery log; the message itself is not stored |

## Content and advertising (Phase 6)

| Table | Key columns |
| --- | --- |
| `blog_posts` | `author_id`, `seller_id` (null for platform posts), `title`, `slug`, `excerpt`, `body`, `cover_image`, `seo_title`, `seo_description`, `status`, `scheduled_for`, `published_at`, `reader_count` |
| `blog_post_revisions` | `post_id`, pending field values, `status` |
| `blog_moderation_history` | `post_id`, `from_status`, `to_status`, `actor_id`, `reason` |
| `blog_categories`, `blog_tags`, plus join tables | |
| `advertisements` | `slug` (unique), `title`, `description`, `advertiser_name`, `image`, `destination_url`, `placements` text[], `priority`, `active`, `starts_at`, `ends_at`, `frequency_cap`, `created_by`. `CHECK` limits `destination_url` to internal paths and `https`. `advertiser_name` is plain text: advertisers have no accounts, and only Super Admin posts ads |

## Payments (Phase 7)

| Table | Key columns | Notes |
| --- | --- | --- |
| `payment_provider_accounts` | `seller_id`, `provider`, `provider_account_id`, `status`, `charges_enabled`, `payouts_enabled` | Unique (`seller_id`, `provider`) |
| `orders`, `order_items` | `buyer_id`, `seller_id`, `status`, `total_minor`, `currency` | Item price is copied at purchase |
| `payment_transactions` | `order_id`, `provider`, `provider_reference` (unique), `type` (charge / refund / chargeback), `status`, `amount_minor`, `idempotency_key` (unique) | |
| `payment_webhook_events` | `provider`, `event_id`, `payload`, `processed_at` | Unique (`provider`, `event_id`) gives idempotency |
| `commission_rules` | `scope`, `rule` jsonb, `active` | Empty until BD-02 |

## Referrals (Phase 8)

| Table | Key columns | Notes |
| --- | --- | --- |
| `referral_codes` | `code` (unique), `owner_type` (marketer / seller), `owner_user_id`, `seller_id`, `active` | |
| `referral_attributions` | `referred_user_id` (**unique**), `referral_code_id`, `referrer_user_id`, `status`, `registered_at`, `completed_at` | The unique constraint enforces one attribution per signup; `CHECK` blocks referrer = referred. Written only by a trigger or function |

## Platform

| Table | Key columns | Notes |
| --- | --- | --- |
| `platform_settings` | `key`, `value` jsonb, `updated_by` | Typed and validated per key |
| `platform_settings_history` | `key`, `old_value`, `new_value`, `actor_id`, `reason`, `created_at` | Written in the same transaction |
| `audit_logs` | `actor_id`, `action`, `target_type`, `target_id`, `on_behalf_of_seller_id`, `reason`, `metadata`, `created_at` | Append-only; a trigger rejects `UPDATE` and `DELETE` |
| `notifications` | `user_id`, `type` (the email template's name), `data`, `read_at`, `created_at`, `idempotency_key` (unique) | Written by `private.enqueue_email`, so the bell and the email describe the same event. Owners read their own through RLS, which Realtime also uses. Kept 90 days (Q-40) |
| `notification_preferences` | `user_id`, `category` (messages, staff: Q-39), `email_enabled` | Applied by a trigger on `background_jobs`, so every way of queuing an email respects it. No row means on |
| `background_jobs` | `type`, `user_id`, `payload`, `status`, `attempts`, `max_attempts`, `run_at`, `locked_until`, `last_error`, `provider_message_id`, `idempotency_key` (unique) | ADR-0002. Stores who an email is for, never the address, which is looked up when sending |
| `view_events` | `entity_type`, `entity_id`, `visitor_hash`, `day` | Unique per listing, visitor and day (Q-16). A job rolls them up into `view_count` and `reader_count`, then prunes them, so public pages never write to listings |
| `rate_limit_counters` | `bucket`, `window_start`, `count` | Pruned by a job |
| `integration_snapshots` | `source`, `key`, `data`, `source_url`, `fetched_at` | Express Entry, FX, weather, jobs |

## Initial settings

Only values the PRD confirms:

| Key | Default | Source |
| --- | --- | --- |
| `publishing.unverified_allowance` | `2` | §6.1 |
| `publishing.global_enabled`, `.verified_enabled`, `.unverified_enabled` | `true` | Implied by §6.3 |
| `blog.seller_publishing_enabled` | `false` | §11.2 |
| `media.max_image_bytes` | `1048576` | §16.3 |
| `media.allowed_formats` | `["jpg", "png", "webp"]` | BD-14 |
| `media.max_dimension` | `4000` | BD-14 |
| `media.max_images` | `5` | BD-14 |

## Migration order

1. Identity, roles, permissions, audit, settings, and the helper functions everything else uses.
2. Sellers and staff, then verification, catalogue and media.
3. Later phases add their own tables as they arrive, so no table exists before something uses it.

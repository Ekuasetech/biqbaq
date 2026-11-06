# Open Questions

Nothing here has been decided. "Working assumption" is what the design does until an answer arrives, chosen so that either answer stays cheap. Blocks = the earliest phase that needs an answer.

## Gaps found while designing (not in PRD §27)

| ID | Question | Working assumption | Blocks |
| --- | --- | --- | --- |
| Q-01 | **No application route exists for Co-admin** (§4.1 lists Seller, Seller Staff, Admin, Marketer), yet §3.4 has Admins delegating to Co-admins. How does someone become one? Must Super Admin approve? | Only Super Admin assigns the role; an Admin grants permissions they hold themselves | Phase 2 |
| Q-02 | **Who can create the first and further Super Admins?** The PRD only says ordinary admins cannot. | First one comes from a one-off server-side script; later ones are added only by a Super Admin; the last active one cannot be removed | Phase 2 |
| Q-03 | **Can an unverified seller edit a published product into a completely different one?** Edits do not count against the allowance (§6.1), so this quietly defeats the two-product limit. | Not blocked; edits to published products by unverified sellers are logged so abuse can be spotted | Phase 3 |
| Q-04 | **Is there a Dealer role?** §8 describes car dealers, but §3 and §4 define no such role. Who may post vehicle listings? | Approved sellers, with no new role | Phase 9 |
| Q-05 | **Do vehicle listings count toward the unverified allowance?** §6.1 only says "products". | They do not count, and need a verified seller | Phase 9 |
| Q-06 | **What happens without a verified contact email?** §9.3 could mean publishing is blocked, or only that the Contact Seller form is off. | Publishing is blocked | Phase 3 |
| Q-07 | **When does a referral "complete"?** §14.3 says "completed registrations": account created, or email verified? | Counted once the email is verified, which also reduces fake signups | Phase 8 |
| Q-08 | **Can one user own more than one seller account?** | One per user; a database constraint that is simple to relax | Phase 3 |
| Q-09 | **Who may review a product?** §3.7 says "where permitted". Any signed-in buyer, or purchasers only? | Any signed-in buyer, one review per product, with a verified-purchase badge when applicable. Seller staff cannot review their own seller's products | Phase 3 |
| Q-10 | **Does a seller's reply to an anonymous enquiry reveal their email to the visitor?** §9.2 sets Reply-To to the visitor and hides the seller's email on the site, but a normal email reply shows it. | Accepted and explained to sellers. Hiding it needs a relay, which is new scope | Phase 4 |
| Q-11 | **Where do the web app and worker run?** Not stated in the PRD. | Undecided; the design works on any host with a scheduler | Before launch |
| Q-12 | **What do verification states mean for the label?** | Only `provider_verified` and `manually_verified` count as verified. Suspended, rejected and expired sellers show "Unverified Seller" | Phase 3 |
| Q-13 | **What is the spam protection for anonymous contact?** §9.2 does not name a method. | Honeypot and rate limits, plus a CAPTCHA provider once one is chosen | Phase 4 |
| Q-14 | **How should the marketplace handle mixed currencies?** Listings are in CAD or NGN, so a single price sort has no meaning across both. | Deferred: the launch is Canada only, in CAD (ADR-0005). The code still groups price sorting by currency, for when Nigeria is added | Later |
| Q-15 | **What are the product categories?** The PRD does not list them. | Fashion, Food & groceries, Beauty and Home, as placeholders in the preview. Electronics was removed at the owner's request (2026-11-05). Cargo Cars has its own page, as it is not a product category | Phase 3 |
| Q-16 | **What counts as a view?** The owner asked for view counts on products and cargo listings, and reader counts on blog posts (2026-11-05); these are not in the PRD. Does every page load count, or one per visitor per period? Do bots and the listing's own seller count? Are counts on listing cards or only the page itself? | Preview shows sample numbers. Likely one view per visitor per day on the listing's own page, excluding bots and the seller, updated in the background | Phase 3 |
| Q-17 | **Is a free website after referrals really being offered?** The owner added a home page tile, "Get a free website After Referrals" (2026-11-05). PRD §2.3 explicitly excludes building, hosting or managing seller websites. If this is the offer: what does the website include, who builds and hosts it, how many referrals earn it, and what counts as one? Should the PRD change? | Tile shown in the preview only, linking to the coming-soon registration page. No website feature is built. Must be settled, or the tile removed, before launch | Before launch |
| Q-18 | **How should Google sign-in work?** The owner asked for it on sign-up and sign-in (2026-11-05); the PRD lists only email registration (§5.1). If someone signs up with Google and later uses email and password with the same address, are they one account? | Button shown in the preview, not connected. Supabase Auth supports Google, and needs Google Cloud credentials from the owner. Same verified email means one account, as the PRD requires one account per user (§3.1). Mobile needs its own setup | Phase 2 |

## PRD §27 decisions, and how much the design depends on them

| ID | Decision | How the design handles it | Blocks |
| --- | --- | --- | --- |
| BD-01 | Dealers also sell vehicles? | Listing has room for it; no sale fields yet | Phase 9 |
| BD-02 | Commission model | Configurable commission rules table, empty for now | Phase 7 |
| BD-03 | Online payment, external contact, or both | Orders are optional and per seller, so "both" works. Checkout policy still needed | Phase 7 |
| BD-04 | Chat attachments | Text only; can be added with a table later | Phase 4 |
| BD-05 | Separate or unified inbox | A conversation links to a product or a vehicle listing, so either UI works on the same tables | Phase 4 |
| BD-06 | Job display approach | Isolated integration | Phase 10 |
| BD-07 | Express Entry only, or broader | Isolated integration | Phase 10 |
| BD-08 | Staff permissions: granular, presets or both | Stored as granular permissions; presets could be added as named bundles | Phase 3 |
| BD-09 | Co-admin permissions and delegation | Permission catalogue plus a no-escalation rule; the exact list is needed. See Q-01 | Phase 2 |
| BD-10 | Product approval requirement | **Needs a `pending_approval` status not listed in §7.1**, added only if this is confirmed | Phase 3 |
| BD-11 | Referral window and precedence | Most recent code at signup, no window, as a placeholder | Phase 8 |
| BD-12 | Payment providers and countries | Provider interface; evaluate against provider terms | Phase 7 |
| BD-13 | SMS provider | Interface only | Phase 10 |
| BD-14 | Image formats, dimensions, counts | Stored in `platform_settings`; only the 1 MB limit has a default | Phase 3 |
| BD-15 | Blog resubmission workflow | Revisions held separately from the live post | Phase 6 |
| BD-16 | Manual verification evidence | Evidence references are free-form for now | Phase 3 |
| BD-17 | Required application fields per role | Stored as validated JSON per role, so fields can change without a migration | Phase 2 |
| BD-18 | Reapply after rejection | Allowed only via a new application; at most one pending per role per user | Phase 2 |

## Needed from the project owner, outside the design

- Accounts and keys: Supabase, Cloudinary, Resend, and a verified sending domain.
- Confirmation that `biqbaq.com` (used in the PRD's examples) is the production domain.
- Docker, or an equivalent, on the development machine for local Supabase and RLS tests.

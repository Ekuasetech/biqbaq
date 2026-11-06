# Open Questions

Nothing here has been decided. "Working assumption" is what the design does until an answer arrives, chosen so that either answer stays cheap. Blocks = the earliest phase that needs an answer.

## Gaps found while designing (not in PRD §27)

| ID | Question | Working assumption | Blocks |
| --- | --- | --- | --- |
| Q-01 | **How does someone become a Co-admin?** | **Decided by the owner (2026-11-06):** only Super Admin gives the role, with no public application. An Admin may grant a Co-admin only permissions the Admin holds | Decided |
| Q-02 | **Who creates Super Admins?** | **Decided by the owner (2026-11-06):** the first comes from a one-off secure server-side script, later ones only from a Super Admin, and the last active one cannot be removed | Decided |
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
| Q-19 | **Who finalises the Conditions of Use and Privacy Notice?** Draft pages exist (2026-11-06), written from the PRD, marked as drafts and hidden from search. The owner must supply the highlighted details: legal company name, minimum age, province, contact and privacy officer details, retention periods, provider locations. | A lawyer familiar with Canadian privacy law reviews both, in English and French. Remove the draft banner and `noindex` only after approval | Before launch |
| Q-20 | **Can someone discover who has an account by contacting Supabase directly?** On the local copy, the sign-up service answers "User already registered" for a confirmed account. Biqbaq's forms hide this, but a direct request bypasses them. | Recheck on the real project, whose settings may differ, and decide during the security review in Phase 12 whether further protection is needed, such as rate limits or a CAPTCHA | Phase 12 |
| Q-21 | **What causes the rare hydration mismatch?** React error 418 appeared in about 0.5% of production page loads in one stress run (3 of 627), on pages combining the page animation with streamed ads, and not at all in later runs (0 of 484 production loads checking every error channel, 0 of a further 1,304 checking only one, and 0 of 325 in development). A related browser test fails very occasionally. The cause is not known, and my earlier guess of an image loading failure was wrong. React recovers by rebuilding the page in the browser, so visitors should see at most a brief flicker | Recheck with real data and monitoring before launch | Phase 12 |
| Q-22 | **Is the account page ever slow for real visitors?** Details took up to about 3 seconds with six browsers on one machine, and two earlier batches timed out at 5 seconds (12 of 48), without the cause being established. Later runs had no failures in 104 attempts | Measure on the real project before launch | Phase 12 |

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
| BD-09 | Co-admin permissions and delegation | **Decided by the owner (2026-11-06):** a Co-admin has only the permissions given to them, from the permission catalogue, and no one can grant a permission they do not hold (no escalation) | Decided |
| BD-10 | Product approval requirement | **Needs a `pending_approval` status not listed in §7.1**, added only if this is confirmed | Phase 3 |
| BD-11 | Referral window and precedence | Most recent code at signup, no window, as a placeholder | Phase 8 |
| BD-12 | Payment providers and countries | Provider interface; evaluate against provider terms | Phase 7 |
| BD-13 | SMS provider | Interface only | Phase 10 |
| BD-14 | Image formats, dimensions, counts | Stored in `platform_settings`; only the 1 MB limit has a default | Phase 3 |
| BD-15 | Blog resubmission workflow | Revisions held separately from the live post | Phase 6 |
| BD-16 | Manual verification evidence | Evidence references are free-form for now | Phase 3 |
| BD-17 | Required application fields per role | **Decided by the owner (2026-11-06):** the fields in PRD §4.3, stored as validated JSON per role so they can change without a migration | Decided |
| BD-18 | Reapply after rejection | Allowed only via a new application; at most one pending per role per user | Phase 2 |

## Needed from the project owner, outside the design

- Accounts and keys: Supabase, Cloudinary, Resend, and a verified sending domain.
- Confirmation that `biqbaq.com` (used in the PRD's examples) is the production domain.
- Docker, or an equivalent, on the development machine for local Supabase and RLS tests.

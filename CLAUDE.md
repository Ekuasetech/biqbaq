# Biqbaq: instructions for Claude Code

Act as a senior engineer working within the approved architecture. `docs/product-requirements.md` is the requirements baseline.

## Before any task
1. Read the relevant docs in `docs/`, and review existing code before changing it.
2. Identify the affected modules (`docs/module-boundaries.md`) and the database and security implications.
3. Propose a plan, then implement the smallest complete feature, with tests.
4. Run the relevant tests and type checks. Report files changed and decisions made. Update the docs.

Do not implement several unrelated modules in one unreviewed operation. Follow the roadmap in `docs/implementation-roadmap.md`.

## Hard rules
- Do not invent business requirements or silently change confirmed ones. Open items live in `docs/decisions/open-questions.md`: ask, do not guess.
- Enforce permissions and business rules on the backend (RLS and database functions, or the server API). Frontend checks are UX only.
- RLS is mandatory on protected tables. Change the schema only through migrations in `supabase/migrations`.
- Never put secrets in web or mobile code: Supabase service-role key, Cloudinary secret, Resend key, payment-provider secrets.
- Modular monolith only: no microservices. No Redis or BullMQ without approval.
- Do not assume an external API is free, public or commercially permitted without checking its terms.

## Out of scope
Do not build, host, theme or manage independent seller websites. Biqbaq only provides the public seller product API and canonical product pages.

## Role and verification invariants
- A role is active only through an approved, active assignment. A submitted or pending application never grants permissions.
- Roles live in relationship tables, never in a single column on the profile.
- Seller Staff access requires both the approved platform role and an active seller membership with permissions.
- Admin approval grants no permissions until Super Admin assigns them. Nobody but Super Admin can touch Super Admin privileges.
- Manual seller verification requires a Super Admin decision and an audit record, and does not bypass suspensions or publishing restrictions.
- Actions on behalf of a seller keep owner and actor distinct, and are audited.
- Unverified sellers have a cumulative, configurable publication allowance (default 2): first publication counts, and neither deletion nor re-creation restores it. Enforced transactionally.

## Definition of done
Business rules implemented, backend authorization enforced, database access secure, validation in place, tests passing, error states handled, docs updated, web and mobile consistent where applicable, nothing else broken.

## Git
Commit or push only when asked.

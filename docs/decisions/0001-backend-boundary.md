# ADR-0001: Backend boundary shared by web and mobile

Status: Proposed

## Context
Web and mobile must share business rules (PRD §2.1, §29). Next.js server actions cannot serve the mobile app, and client checks cannot be trusted.

## Decision
- Transactional invariants and row access live in PostgreSQL (RLS and RPC functions).
- Operations needing secrets or external providers live in a versioned `/api/v1` server API in `apps/web`, backed by `modules/*`. Mobile uses it through `packages/api-client`.
- Server actions may only be thin wrappers over the same modules.

## Consequences
- Web and mobile cannot drift, because neither one holds the rule.
- Some business logic is in SQL, so it needs pgTAP tests and disciplined migrations.
- `apps/web` is both a website and an API. That fits the modular monolith; `modules/` must stay free of UI imports so it can be moved later if needed.

## Alternatives rejected
- **Supabase Edge Functions as the whole API:** splits the domain code from the Next.js app and its public API routes.
- **All logic in the Next.js API, no RPCs:** direct client reads and Realtime still need RLS, and allowance checks still need database locks, so the rules would end up in both places.

# ADR-0003: Authorization is read from the database, not JWT claims

Status: Proposed

## Context
Suspending a role must remove its permissions (PRD §4.6). Claims in a JWT stay valid until the token expires, so a suspended admin could keep acting.

## Decision
RLS policies and RPCs call helper functions (`has_permission`, `has_active_role`, `has_seller_permission`) that read current assignments. Policies wrap `auth.uid()` and these helpers as `(select ...)` so PostgreSQL evaluates them once per statement rather than per row, and the lookup columns are indexed.

## Consequences
- Suspension and revocation apply on the next request.
- A small cost per query, which is kept down by the above. The public catalogue is unaffected because it reads views that do not need these helpers.
- Clients fetch their roles from an endpoint to choose dashboards. That value is for display only.

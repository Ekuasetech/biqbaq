# ADR-0002: Background jobs on a PostgreSQL table

Status: Proposed

## Context
PRD §21 needs retries, failure tracking, idempotency, job status and monitoring, with a replaceable queue and no Redis/BullMQ by default. It asks for Supabase Queues/PGMQ to be evaluated.

## Decision
Use a `background_jobs` table claimed with `FOR UPDATE SKIP LOCKED`, behind a `JobQueue` interface (`enqueue`, `claim`, `complete`, `fail`). A scheduled worker runs batches on a short interval. Business transactions enqueue in the same transaction, so a job exists only if the change committed.

Each job has a type, payload, status, attempt count, next-run time, last error and a unique idempotency key. Failures back off and then stop at `dead` status for inspection. `pg_cron` or the host's scheduler triggers the worker, and creates recurring work such as scheduled blog publication.

## Consequences
- Job status and failure history are ordinary rows, easy to show in an admin page.
- No extension is required, and the interface allows a later swap.
- Throughput is modest. That is fine for email and notification volumes at launch.

## Alternatives considered
- **PGMQ / Supabase Queues:** a good fit for queueing and also transactional, but status and failure history would still need a separate table for monitoring. A reasonable swap later if volume grows.

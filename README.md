# Biqbaq

A marketplace for Nigerians in Canada (Canada only for now, see ADR-0005): products, vehicle shipping and shared cargo opportunities, and seller tools, on web (Next.js) and mobile (React Native / Expo) with one Supabase backend.

**Status:** early development. The public web pages run on sample data, with no backend connected yet. The design docs are awaiting review.

## Run the web app

```sh
npm install
npm run dev -w web      # http://localhost:3000
npm test -w web         # unit tests
npm run test:e2e -w web # browser tests (run `npm run build -w web` first)
```

Copy `apps/web/.env.example` to `apps/web/.env.local` when connecting Supabase. Never commit real keys.

## Where to start

- [Product requirements](docs/product-requirements.md): the requirements baseline.
- [System architecture](docs/system-architecture.md): how the system fits together.
- [Open questions](docs/decisions/open-questions.md): decisions still needed.
- [CLAUDE.md](CLAUDE.md): working rules for AI-assisted development.

## Layout

| Path | Contents |
| --- | --- |
| `apps/web` | Next.js web app, and the trusted server API |
| `apps/mobile` | React Native (Expo) app |
| `packages/*` | Shared types, validation, domain contracts, API client |
| `supabase/` | Migrations, functions, seed data, database tests |
| `docs/` | Requirements, design docs, decision records |

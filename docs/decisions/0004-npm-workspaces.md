# ADR-0004: npm workspaces for the monorepo

Status: Proposed

## Decision
Use npm workspaces (`apps/*`, `packages/*`), which ship with the installed Node and need no extra tool. Add a task runner such as Turborepo only if build times justify it.

## Consequences
Expo's Metro bundler may need monorepo configuration for hoisted dependencies. This gets tested during Phase 1 setup. If it proves troublesome, switching package manager is cheap at that stage.

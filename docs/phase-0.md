# Phase 0: design, specification, skeleton

Status: complete (owner sign-off 2026-11-17), ready for Phase 1. Last updated 2026-11-17.

## Deliverables

| Area | Where |
|---|---|
| Decisions and constraints | `docs/ROADMAP.md` |
| Capability specs (media, search, reminders, identity, settings, offline-sync, platform) | `docs/openspec/specs/<capability>/spec.md` |
| Pending changes | `docs/openspec/changes/<id>/` |
| Conventions | `docs/openspec/project.md` |
| Data model | migration `backend/src/main/resources/db/migration/V001__initial_schema.sql` (source of truth) |
| REST contract | `api/openapi.yaml` (server interfaces and TS types are generated) |
| Design system, tokens, interactions | `docs/design/` (start with `README.md`) |
| Clickable prototype | `docs/design/prototypes/index.html` |
| Backend skeleton | `backend/` (Spring Boot, Modulith, Flyway, Testcontainers, static SPA serving, actuator probes) |
| Frontend skeleton | `frontend/` (Vite, React, Tailwind, TanStack Query, Dexie, typed API client, `/actuator/health` reachability hook) |
| Local run | `deploy/docker/` (Dockerfile, compose) |
| CI | `.github/workflows/ci.yml` |

Liveness and readiness: `/actuator/health/liveness`, `/actuator/health/readiness`.

## Phase 1 entry points

- Backend: follow the pending changes in order (see `docs/openspec/project.md`): `identity-github-oauth`, `media-core`, `media-search` (`offline-sync` comes with the Offline/PWA phase).
- Frontend: apply the Tailwind 4 tokens from `docs/design/design-system.md`, build screens from its components section and the prototype, online-first; the Dexie cache and the mutation outbox (`offline-sync`) come with the Offline/PWA phase.
- Every behavioural change starts as a proposal under `docs/openspec/changes/` (see `CLAUDE.md`).

## Open items

See `docs/TODO.md`.

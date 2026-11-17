# TODO

Open items collected from `docs/`. Per-task checklists stay in `docs/openspec/changes/<id>/tasks.md`; this file lists what is undecided or waiting. Delete a line when it is done.

Sources of truth: `backend/.../db/migration/V001__initial_schema.sql` for the schema, `api/openapi.yaml` for the contract. Specs and change docs follow them.

## Start of Phase 1

- Commit the Phase 0 state (owner).
- First CI run (former skeleton I4): push to GitHub, `actionlint` clean, all four jobs green.
- Manual end-to-end check (former skeleton I5, owner): compose up, `GET /actuator/health` is 200 `UP`, the app shell loads. Record the result in `docs/openspec/changes/archive/project-skeleton/design.md` section 11.
- Confirm the session cookie name `SESSION` in the contract against the Spring Session config when identity lands.

## Decisions to rethink later

- **Key storage and encryption.** For now no encryption and no `user_secrets`: the TMDb key stays in `external_data_source_configuration` (`apiKey`) as is; token status is derived (in-memory `rejected`, else `unknown`). Rethink after seeing how it behaves: AES-GCM with versioned keys. `CLAUDE.md`, `ROADMAP.md` and the `search` spec still say the key is encrypted; reconcile then. Never log keys either way. The license key is returned to its owner and stored encrypted (reminders spec).
- Identity: GitHub redirect endpoints and dev-login are not in the contract (postponed with `identity-github-oauth`, which adds only the Spring Session tables).

## Open product questions

All questions from the specs were answered on 2026-11-17 and recorded in the specs ("Decisions (formerly open)"). Still open:

- Passkeys and account recovery are on hold (parked, phase 9); the owner is still deciding.
- Extra data sources (Goodreads, OMDb were rejected earlier).

## Design

- Not designed yet: Reminders, sign-in, install walkthrough (`docs/design/design-system.md`).
- Movies have no author or director: drop the author line from the movie card in `design-system.md` and the prototype.
- After the first real UI screens exist: delete `docs/design/prototypes/` and the `data-theme` override block in `frontend/src/theme.css`.

## Infrastructure and operations

- Generate the current data model at build time from a running PostgreSQL (schema dump or SchemaSpy in CI).
- Analyse push notification mechanisms before implementing reminders push (write the result as a design under `docs/openspec/changes/`): Web Push with VAPID from the server (Java library choice); how due notifications are found and fired (per-minute poll on `notified_at` vs a DB-backed job scheduler with a lock for more than one replica vs a transactional outbox with retries); delivery guarantees and idempotency across restarts and late firing; retry/backoff and removal of dead subscriptions (404/410); timezone handling (09:00 local, `UserTimezoneChanged` rescheduling); iOS constraints (installed PWA only, 16.4+, no action buttons, evictable subscriptions); VAPID key storage and rotation; whether a server-side outbox table is needed at all. `ROADMAP.md` already decides: no fallback channel and a single one-time hint if notifications are off.
- Postgres on k3s: CloudNativePG vs external (PostgreSQL 18 is used now).
- Helm chart in `deploy/helm/` (Traefik, cert-manager); VAPID keys and DB credentials as Kubernetes Secrets.
- Runbooks in `docs/runbooks/` once there is a deployment: deploy and rollback, DB restore, push troubleshooting.
- Rate limiter in `media-search` is in-memory (single replica); move to Postgres/Redis if the chart runs more than one replica.
- Service worker caching of covers and CSP `img-src` for `covers.openlibrary.org` and `image.tmdb.org` (Phase 5).
- Optional: Java healthcheck for the compose `app` service (image has no curl); not needed for k3s probes.
- Revisit one Gradle project vs sub-projects only if build time hurts; router choice is deferred to the first feature change.
- `SecurityContextCurrentUserProvider` replaces the mock provider when `identity-github-oauth` lands; the skeleton Dexie db `rwx` becomes per-user (`rwx-<userId>`) with `mock-user`.

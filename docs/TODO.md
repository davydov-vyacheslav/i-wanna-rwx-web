# TODO

Open items collected from `docs/`. Per-task checklists stay in `docs/openspec/changes/<id>/tasks.md`; this file lists what is undecided or waiting. Delete a line when it is done.

Sources of truth: `backend/.../db/migration/V001__initial_schema.sql` for the schema, `api/openapi.yaml` for the contract. Specs and change docs follow them.

## Start of Phase 1

- After the full deployment / PWA phase (owner): iPhone checks (OAuth redirect return in an installed PWA, safe-area gutters on a device, dark mode), ru/uk locale check, offline "Can't reach the server" state (see `docs/dev-notes.md`).
- Check the account data export download (`<a download>` of the JSON blob) on an iPhone, installed PWA and Safari: it may open a share/preview sheet instead of saving (from `settings-screen`).
- Fail-fast on empty `RWX_GITHUB_CLIENT_ID` / `RWX_GITHUB_CLIENT_SECRET` has no automated test yet.

## Documentation

- Write a representative main `README.md`: what RWX is (product idea, screenshots once the UI exists), feature list, stack, architecture overview, quick start, link to `docs/dev-notes.md` and `docs/ROADMAP.md`. The current one is a developer cheat sheet.

## Decisions to rethink later

- **Explicit `CookieSerializer`.** Try dropping the bean in favour of Boot properties (`server.servlet.session.cookie.*`, `spring.session.*`), decided by a `@SpringBootTest(webEnvironment = RANDOM_PORT)` test asserting the `SESSION` cookie flags (HttpOnly, SameSite=Lax, Max-Age 30d) on the real embedded server.
- **Key storage and encryption.** For now no encryption and no `user_secrets`: data source API keys stay in `user_source_keys.api_key` (V001, `datasource` design 16.2) as is; there is no key status. Rethink after seeing how it behaves: AES-GCM with versioned keys (a key version column would be a new migration after the first deploy). The current `search` spec (renamed `datasource` on archive) still says encrypted in places; the media-search delta says stored as is; reconcile then. Never log keys either way. The license key is returned to its owner and stored encrypted (reminders spec).

## Backend cleanup ideas

- TMDb test fixtures are synthetic (hand-written from the public API v3 docs, `backend/src/test/resources/providers/tmdb/synthetic/`) because recording needs the owner's API key: replace them with recorded real responses once a key is available, and do one live manual check of the TMDb source (search, movie, tv) with the key entered in Settings > Sources. Open Library fixtures are recorded from the real API.
- `RWX_DATASOURCE_CONTACT` (was `RWX_SEARCH_CONTACT`; properties `rwx.datasource.*`) is required in every profile including `dev` (fail-fast like the GitHub credentials): update your local `deploy/docker/.env`. Revisit if it gets in the way of plain `bootRun`.

- The default data source control in Settings > Sources is built but stays invisible while each type has a single registered source (`datasource` DS-F4); revisit when a second source is added.

## Open product questions

All questions from the specs were answered on 2026-11-17 and recorded in the specs ("Decisions (formerly open)"). Still open:

- Extra data sources (Goodreads, OMDb were rejected earlier).

## Push (future phases)

- Re-add the `push_subscriptions` table (removed from V001 for now because nothing uses it; by then V001 may be frozen, so it becomes a new migration): `id uuid pk`, `user_id` FK to `users` ON DELETE CASCADE, `endpoint text` unique, `p256dh`, `auth`, `created_at`, index on `user_id`; and add a media/push row to the account-deletion cascade test.
- Implement push subscriptions fully (phase 6): `PushSubscriptionEntity`/repository in the push module, `POST/DELETE /push-subscriptions`, VAPID key endpoint, and the rule from `docs/openspec/changes/push-notifications/`: disabling push in Settings (`PATCH /settings pushNotificationsEnabled=false`, the flag and its column are added in the same phase) deletes all of the user's subscriptions in the same request (the push module listens to an identity event or exposes a published API; identity has no push code now, the table cascades with the user).

## Design

- App icon: a placeholder is in `frontend/public/` (`icon.svg`: white "RWX" on the accent orange `#C2410C`, rendered once to `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`; linked in `index.html` as favicon and apple-touch-icon). Discuss the real design (a drawn mark instead of system-font text, maskable variant with safe zone for Android, dark/tinted iOS variants, splash images) and add the manifest `icons` in the Offline/PWA phase.

- Not designed yet: Reminders, sign-in, install walkthrough (`docs/design/design-system.md`).
- Movies have no author or director: drop the author line from the movie card in `design-system.md` and the prototype.
- After the first real UI screens exist: delete `docs/design/prototypes/` and the `data-theme` override block in `frontend/src/theme.css`.

## Infrastructure and operations

- Generate the current data model at build time from a running PostgreSQL (schema dump or SchemaSpy in CI).
- Analyse push notification mechanisms before implementing reminders push (write the result as a design under `docs/openspec/changes/`): Web Push with VAPID from the server (Java library choice); how due notifications are found and fired (per-minute poll on `notified_at` vs a DB-backed job scheduler with a lock for more than one replica vs a transactional outbox with retries); delivery guarantees and idempotency across restarts and late firing; retry/backoff and removal of dead subscriptions (404/410); timezone handling (09:00 local, `UserTimezoneChanged` rescheduling); iOS constraints (installed PWA only, 16.4+, no action buttons, evictable subscriptions); VAPID key storage and rotation; whether a server-side outbox table is needed at all. `ROADMAP.md` already decides: no fallback channel and a single one-time hint if notifications are off.
- Postgres on k3s: CloudNativePG vs external (PostgreSQL 18 is used now).
- Helm chart in `deploy/helm/` (Traefik, cert-manager); VAPID keys and DB credentials as Kubernetes Secrets.
- Runbooks in `docs/runbooks/` once there is a deployment: deploy and rollback, DB restore, push troubleshooting.
- Rate limiter in `datasource` is in-memory (single replica); move to Postgres/Redis if the chart runs more than one replica (`datasource` DS-B16, parked: Bucket4j with its JDBC backend, needs the owner's approval of the dependency).
- Service worker caching of covers and CSP `img-src` for `covers.openlibrary.org` and `image.tmdb.org` (Phase 5).
- Optional: Java healthcheck for the compose `app` service (image has no curl); not needed for k3s probes.
- Revisit one Gradle project vs sub-projects only if build time hurts; router choice is deferred to the first feature change.
- CI version numbering: derive the version automatically on push (from `git describe` / tags, or the run number) and stamp it on the image tag and in the app (backend build info, shown in the UI footer or Settings).
- Publish images (backend + frontend, one image) to GitHub Container Registry from CI on pushes to `main`.
- A second compose file for stable testing that pulls the images from GHCR instead of building local sources (local compose keeps building).
- The `sending cache export` line in the CI log is only the buildx `gha` cache export; no action.
- Low priority hardening: expose the actuator on a separate management port (not reachable through the public ingress).

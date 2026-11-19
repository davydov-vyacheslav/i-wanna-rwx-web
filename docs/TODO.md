# TODO

Open items collected from `docs/`. Per-task checklists stay in `docs/openspec/changes/<id>/tasks.md`; this file lists what is undecided or waiting. Delete a line when it is done.

Sources of truth: `backend/.../db/migration/V001__initial_schema.sql` for the schema, `api/openapi.yaml` for the contract. Specs and change docs follow them.

## Before the Phase 3 PR merge (owner manual)

- iPhone checks of the media screens (installed PWA and Safari): safe-area at the bottom tab bar and the sticky search row in standalone mode; keyboard in the add sheet (`visualViewport`); swipe-to-delete and the snap-back after Cancel; focus and VoiceOver across nested sheets (`inert`); the 44px hit area of the inline Settings link; the 300 ms tap guard on a real network.
- Live TMDb check with a real key entered in Settings > Sources (search, movie, tv). Not confirmed by the owner yet.
- Account data export download (`<a download>` of the JSON blob) on an iPhone, installed PWA and Safari: it may open a share/preview sheet instead of saving (from `settings-screen`).
- Decide while V001 is still editable: add `CHECK (char_length(cover_url) <= 4096)` and the same for `movies.poster_url` (the other URL columns have a length CHECK, these two have none).
- Decide: enforce Prettier repo-wide or not. `npm run format:check` flags `src/i18n/{en,ru,uk}.ts` and CI does not run it; enforcing means formatting those three files and adding the step to `.github/workflows/ci.yml`.

## Start of Phase 4 (Reminders)

- STRONGLY RECOMMENDED by the owner, before the first reminders task: Graphify trial (Phase 4 in `docs/ROADMAP.md` has the checks and the adopt-only-on-clear-gain rule).
- STRONGLY RECOMMENDED by the owner, before the first reminders task: "review lessons" for the agents (a short section in `CLAUDE.md`/agent definitions, a self-review checklist, a simplicity pass by `code-reviewer`). Seed lessons from the Phase 3 reviews:
  - general errors and exceptions live in `common`;
  - no raw SQL or `@Query` where a derived query or `@Lock` does the job;
  - feature sub-packages plus `common` per module, no public classes in the module root;
  - merge duplicated invariant flows and parametrize shared tests;
  - no single-use classes, no interfaces with one implementation;
  - no duplicated constants.
- Reminders UI is not designed yet (`docs/design/design-system.md`); design it with the Reminders tab.
- `docs/design/design-system.md` describes a 4-tab bar with Reminders, which becomes true now (owner OK, no change needed); the prototypes show the Reminders tab disabled.
- Movies have no author or director: `design-system.md` line 82 (list card) still says "author or No author" for every card, and the prototype card (`docs/design/prototypes/app.html`, the `card` renderer and the detail view) shows `noAuthor` for movies. The real `MovieCard` is already right. Fix the doc and the prototype.
- Prototypes and `data-theme`: do not delete yet. `docs/design/prototypes/` is still the only visual reference for Reminders, the install walkthrough and the notification states (Phases 4 to 6), and is referenced from `docs/design/design-system.md`, `docs/design/README.md`, `README.md` and `frontend/src/theme.css`. Delete it together with the `[data-theme='dark']` block and the "also linked by app.html" comment in `frontend/src/theme.css` (note `:root:not([data-theme='light'])` at line 29 also keys on `data-theme`: rewrite it as a plain `prefers-color-scheme` rule) once Phase 6 UI exists, and fix the four doc references.
- Fixed-position toast (`components/Toast.tsx`) and the list FAB (`ListScreen.tsx`) assume the sidebar is the only offset on wide screens; recheck if another fixed element is added (e.g. a reminders banner).
- Add a push row to the account-deletion cascade test when Phase 6 adds `push_subscriptions` (media rows are covered).

## Phase 5 (Offline/PWA)

- Re-check against the Phase 3 specs before starting `offline-sync`: the offline/sync states in `docs/design/design-system.md` and `docs/design/INTERACTIONS.md`, the `offline-sync` and `platform` specs and `docs/openspec/changes/offline-sync/` (e.g. the Phase 3 error model without `unsupported_source`, source name fields, Undo-through-outbox wording while Phase 3 delete is confirm-and-wait). Owner OK.
- App icon: a placeholder is in `frontend/public/` (`icon.svg`: white "RWX" on the accent orange `#C2410C`, rendered once to `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`; linked in `index.html`). Discuss the real design (a drawn mark instead of system-font text, maskable variant with safe zone for Android, dark/tinted iOS variants, splash images) and add the manifest `icons`.
- Service worker caching of covers and CSP `img-src` for `covers.openlibrary.org` and `image.tmdb.org`.
- iPhone checks of the installed PWA: OAuth redirect return, safe-area gutters, dark mode, ru/uk locale, offline "Can't reach the server" state (see `docs/dev-notes.md`).
- Install walkthrough design (not designed yet).
- Sign-in page design (not designed yet; the login page exists as a minimal screen).

## Phase 6 (Push)

- Before reminders push, write the push mechanism analysis as a design under `docs/openspec/changes/`: Web Push with VAPID from the server (Java library choice); how due notifications are found and fired (per-minute poll on `notified_at` vs a DB-backed job scheduler with a lock for more than one replica vs a transactional outbox with retries); delivery guarantees and idempotency across restarts and late firing; retry/backoff and removal of dead subscriptions (404/410); timezone handling (09:00 local, `UserTimezoneChanged` rescheduling); iOS constraints (installed PWA only, 16.4+, no action buttons, evictable subscriptions); VAPID key storage and rotation; whether a server-side outbox table is needed at all. `ROADMAP.md` already decides: no fallback channel and a single one-time hint if notifications are off.
- Re-add the `push_subscriptions` table (removed from V001 because nothing uses it; by then V001 may be frozen, so it becomes a new migration): `id uuid pk`, `user_id` FK to `users` ON DELETE CASCADE, `endpoint text` unique, `p256dh`, `auth`, `created_at`, index on `user_id`.
- Implement push subscriptions fully: `PushSubscriptionEntity`/repository in the push module, `POST/DELETE /push-subscriptions`, VAPID key endpoint, and the rule from `docs/openspec/changes/push-notifications/`: disabling push in Settings (`PATCH /settings pushNotificationsEnabled=false`, the flag and its column are added in the same phase) deletes all of the user's subscriptions in the same request (the push module listens to an identity event or exposes a published API; identity has no push code now, the table cascades with the user).
- Delete `docs/design/prototypes/` and the `data-theme` block in `frontend/src/theme.css` (see Phase 4 for the exact steps).

## Phase 7 (Ops / CI)

- Helm chart in `deploy/helm/` (Traefik, cert-manager); VAPID keys and DB credentials as Kubernetes Secrets.
- Postgres on k3s: CloudNativePG vs external (PostgreSQL 18 is used now).
- Rate limiter in `datasource` is in-memory (single replica); move to Postgres/Redis if the chart runs more than one replica (`datasource` DS-B16, Bucket4j with its JDBC backend, needs the owner's approval of the dependency and of the token-bucket semantics).
- CI version numbering: derive the version automatically on push (from `git describe` / tags, or the run number) and stamp it on the image tag and in the app (backend build info, shown in the UI footer or Settings).
- Publish images (backend + frontend, one image) to GitHub Container Registry from CI on pushes to `main`.
- A second compose file for stable testing that pulls the images from GHCR instead of building local sources (local compose keeps building).
- Generate the current data model at build time from a running PostgreSQL (schema dump or SchemaSpy in CI).
- Runbooks in `docs/runbooks/` once there is a deployment: deploy and rollback, DB restore, push troubleshooting.
- Low priority hardening: expose the actuator on a separate management port (not reachable through the public ingress).
- `refs/shelf/{full,cut,pre-cleanup}` and `.git/shelf-media-sync.patch` are local-only (no remote has them) and are the reuse source for Phases 4-6 (reminders/subscriptions/licenses, sync, push): do not gc; push them to a remote or archive the patch somewhere durable before a clone or machine change (do this before Phase 4 if the machine may change earlier).

## Backlog / ideas

- Fail-fast on empty `RWX_GITHUB_CLIENT_ID` / `RWX_GITHUB_CLIENT_SECRET` has no automated test (`GithubLoginTests` and `GithubSignUpLocaleTests` do not cover it).
- Explicit `CookieSerializer` (`identity/security/SecurityConfig.java`): try dropping the bean in favour of Boot properties (`server.servlet.session.cookie.*`, `spring.session.*`), decided by a `@SpringBootTest(webEnvironment = RANDOM_PORT)` test asserting the `SESSION` cookie flags (HttpOnly, SameSite=Lax, Max-Age 30d) on the real embedded server.
- Key storage and encryption: data source API keys stay in `user_source_keys.api_key` as is (no encryption, no `user_secrets`, no key status; `datasource` spec and design agree, the old contradiction is gone). Rethink after seeing how it behaves: AES-GCM with versioned keys (a key version column would be a new migration after the first deploy). Never log keys either way. The license key is returned to its owner and stored encrypted (reminders spec).
- TMDb test fixtures are synthetic (hand-written from the public API v3 docs, `backend/src/test/resources/providers/tmdb/synthetic/`): replace them with recorded real responses once a key is available. Open Library fixtures are recorded from the real API.
- `RWX_DATASOURCE_CONTACT` (properties `rwx.datasource.*`) is required in every profile including `dev` (`@NotBlank`, fail-fast like the GitHub credentials): revisit if it gets in the way of plain `bootRun`.
- The default data source control in Settings > Sources is built but stays invisible while each type has a single registered source (`SourcesSection`, `items.length >= 2`); revisit when a second source is added.
- Extra data sources (Goodreads, OMDb were rejected earlier).
- `SearchQuery` / `SourceUrlQuery` in the contract carry no `minLength`/`maxLength` (the server checks 3 to 200 code points and the URL length): if limits are ever put into the contract, `ProblemAdvice` needs a `ConstraintViolationException` handler (none exists) to keep the 400 `validation` shape.
- The card's open area intentionally has no focus indicator (owner decision): revisit only if keyboard accessibility becomes a requirement.
- Frontend cleanup, low priority: `Avatar` (`features/settings/AccountSection.tsx`) is exported but used only in its file, `SourceRef` (`features/settings/useDataSources.ts`) and `ApiClientOptions` (`api/client.ts`) are exported but used only in their files: drop the `export`; `features/media/AddSheet.tsx` is 467 lines: split if it grows.
- Write a representative main `README.md`: what RWX is (product idea, screenshots once the UI exists), feature list, stack, architecture overview, quick start, link to `docs/dev-notes.md` and `docs/ROADMAP.md`. The current one is a developer cheat sheet.
- Optional: Java healthcheck for the compose `app` service (image has no curl); not needed for k3s probes.
- Revisit one Gradle project vs sub-projects only if build time hurts.
- `docs/dev-notes.md` still says Settings is "the only signed-in screen until Phase 3" (Smoke checks) and has no media smoke checks: refresh it with the Phase 3 manual checks.

# TODO

Open items collected from `docs/`. Per-task checklists stay in `docs/openspec/changes/<id>/tasks.md`; this file lists what is undecided or waiting. Delete a line when it is done.

Sources of truth: `backend/.../db/migration/V001__initial_schema.sql` for the schema, `api/openapi.yaml` for the contract. Specs and change docs follow them.

## Owner decisions and checks (open now)

- Live TMDb check with a real key entered in Settings > Sources (search, movie, tv). Not confirmed by the owner yet.

## Phase 5 leftovers (PWA and desktop)

- Fixed-position toast (`components/Toast.tsx`) and the list FAB (`ListScreen.tsx`) assume the sidebar is the only offset on wide screens; recheck if another fixed element is added (e.g. a reminders banner).

## Phase 6 (Ops / CI)

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
- `RWX_DATASOURCE_CONTACT` (properties `rwx.datasource.*`) is required in every profile including `dev` (`NotBlank`, fail-fast like the GitHub credentials): revisit if it gets in the way of plain `bootRun`.
- Write a representative main `README.md`: what RWX is (product idea, screenshots once the UI exists), feature list, stack, architecture overview, quick start, link to `docs/dev-notes.md` and `docs/ROADMAP.md`. The current one is a developer cheat sheet.
- Optional: Java healthcheck for the compose `app` service (image has no curl); not needed for k3s probes.

## Phase 7 (Polish)

- Decide: enforce Prettier repo-wide or not. `npm run format:check` flags `src/i18n/{en,ru,uk}.ts` and CI does not run it; enforcing means formatting those three files and adding the step to `.github/workflows/ci.yml`.
- TMDb test fixtures are synthetic (hand-written from the public API v3 docs, `backend/src/test/resources/providers/tmdb/synthetic/`): replace them with recorded real responses once a key is available. Open Library fixtures are recorded from the real API.
- Server 400 field messages are shown in English in the reminders sheet: the contract has no localizable code per violation (`Problem` field errors carry only `message`). Add a code (or a code-to-text map) to the contract to localize them.
- `MAX_EXPIRY` (2999-12-31) and `MAX_CUSTOM_DAYS` (36500) in `features/reminders/ReminderSheet.tsx` mirror the contract and V001 bounds by hand: derive them from the generated client or add a test that compares them to `openapi.yaml`.
- `minProperties: 1` is still in the contract for `UpdateSettingsRequest` (the generator does not enforce it; `SettingsService` checks it by hand). The media and reminders update schemas have none: an empty PATCH is a 200 no-op there. Either drop it from settings too or enforce it everywhere.
- `SearchQuery` / `SourceUrlQuery` in the contract carry no `minLength`/`maxLength` (the server checks 3 to 200 code points and the URL length): if limits are ever put into the contract, `ProblemAdvice` needs a `ConstraintViolationException` handler (none exists) to keep the 400 `validation` shape.
- The card's open area intentionally has no focus indicator (owner decision): revisit only if keyboard accessibility becomes a requirement.
- Frontend cleanup, low priority: `Avatar` (`features/settings/AccountSection.tsx`) is exported but used only in its file, `SourceRef` (`features/settings/useDataSources.ts`) and `ApiClientOptions` (`api/client.ts`) are exported but used only in their files: drop the `export`; `features/media/AddSheet.tsx` is 467 lines: split if it grows.
- `docs/dev-notes.md` still says Settings is "the only signed-in screen until Phase 3" (Smoke checks) and has no media smoke checks: refresh it with the Phase 3 manual checks.

## Phase 8 (Security and compliance)

- The license key is plaintext until the Security phase (ROADMAP phase 8): DB column, API, TanStack cache, IndexedDB (offline sync phase 10) and the export file.
- Key storage and encryption: data source API keys stay in `user_source_keys.api_key` as is (no encryption, no `user_secrets`, no key status; `datasource` spec and design agree, the old contradiction is gone). Rethink after seeing how it behaves: AES-GCM with versioned keys (a key version column would be a new migration after the first deploy). Never log keys either way. The license key is returned to its owner and stored in plaintext until the Security phase 8 (reminders spec).
- Fail-fast on empty `RWX_GITHUB_CLIENT_ID` / `RWX_GITHUB_CLIENT_SECRET` has no automated test (`GithubLoginTests` and `GithubSignUpLocaleTests` do not cover it).
- Explicit `CookieSerializer` (`identity/security/SecurityConfig.java`): try dropping the bean in favour of Boot properties (`server.servlet.session.cookie.*`, `spring.session.*`), decided by a `SpringBootTest(webEnvironment = RANDOM_PORT)` test asserting the `SESSION` cookie flags (HttpOnly, SameSite=Lax, Max-Age 30d) on the real embedded server.

## After the first deploy (iPhone and device checks)

- iPhone checks of the media screens (installed PWA and Safari): safe-area at the bottom tab bar and the sticky search row in standalone mode; keyboard in the add sheet (`visualViewport`); swipe-to-delete and the snap-back after Cancel; focus and VoiceOver across nested sheets (`inert`); the 44px hit area of the inline Settings link; the 300 ms tap guard on a real network.
- Account data export download (`<a download>` of the JSON blob) on an iPhone, installed PWA and Safari: it may open a share/preview sheet instead of saving (from `settings-screen`).
- iPhone checks of the reminders screens, after the first deploy (owner decision 2026-11-20; installed PWA and Safari): add/edit sheet with the keyboard (`visualViewport`); the native date wheel; swipe-to-delete combined with the card tap; safe areas (tab bar, FAB, sheets); 320 px wide layouts (ru/uk labels, segments, card); contrast of the selected segment in dark mode (`segment-on`).
- iPhone checks of the installed PWA, after the first deploy (owner decision 2026-11-20): OAuth redirect return, safe-area gutters, dark mode, ru/uk locale, offline "Can't reach the server" state (see `docs/dev-notes.md`).
- Install walkthrough strings (`install.step2`, `install.step3`, `install.row.ios` in `frontend/src/i18n/{en,ru,uk}.ts`): copy the iOS menu names (Share, "Add to Home Screen", "Add") from a real iPhone in each language; they follow the standard iOS wording but are unverified. Check also that the Chrome/Edge iOS flow matches.
- The checklist of ten iPhone checks lives in `docs/openspec/changes/archive/pwa-install/design.md` section 10 (task F6 copies it to `docs/dev-notes.md`); OAuth inside the installed PWA is the riskiest one.

## Phase 9 (Push)

- Before reminders push, write the push mechanism analysis as a design under `docs/openspec/changes/`: Web Push with VAPID from the server (Java library choice); how due notifications are found and fired (per-minute poll on `notified_at` vs a DB-backed job scheduler with a lock for more than one replica vs a transactional outbox with retries); delivery guarantees and idempotency across restarts and late firing; retry/backoff and removal of dead subscriptions (404/410); timezone handling (09:00 local, `UserTimezoneChanged` rescheduling); iOS constraints (installed PWA only, 16.4+, no action buttons, evictable subscriptions); VAPID key storage and rotation; whether a server-side outbox table is needed at all. `ROADMAP.md` already decides: no fallback channel and a single one-time hint if notifications are off.
- Re-add the `push_subscriptions` table (removed from V001 because nothing uses it; after the first deploy V001 is frozen, so it is a new migration): `id uuid pk`, `user_id` FK to `users` ON DELETE CASCADE, `endpoint text` unique, `p256dh`, `auth`, `created_at`, index on `user_id`.
- Implement push subscriptions fully: `PushSubscriptionEntity`/repository in the push module, `POST/DELETE /push-subscriptions`, VAPID key endpoint, and the rule from `docs/openspec/changes/push-notifications/`: disabling push in Settings (`PATCH /settings pushNotificationsEnabled=false`, the flag and its column are added in the same phase) deletes all of the user's subscriptions in the same request (the push module listens to an identity event or exposes a published API; identity has no push code now, the table cascades with the user).
- Prototypes and `data-theme`: do not delete yet. `docs/design/prototypes/` is still the only visual reference for Reminders, the install walkthrough and the notification states (Phases 4 to 6), and is referenced from `docs/design/design-system.md`, `docs/design/README.md`, `README.md` and `frontend/src/theme.css`. Delete it together with the `[data-theme='dark']` block and the "also linked by app.html" comment in `frontend/src/theme.css` (note `:root:not([data-theme='light'])` at line 29 also keys on `data-theme`: rewrite it as a plain `prefers-color-scheme` rule) once Phase 9 UI exists, and fix the four doc references.
- Add a push row to the account-deletion cascade test when Phase 9 adds `push_subscriptions` (media rows are covered).

## Phase 10 (Offline sync, after the first deploy)

- Re-check against the Phase 3 and 4 code and specs before starting `offline-sync` (the change was written for the old phase 5; `notifyAt` is not stored, delete is confirm-and-wait, V001 is frozen so `change_seq` and `applied_mutations` need a new migration): the offline/sync states in `docs/design/design-system.md` and `docs/design/INTERACTIONS.md`, the `offline-sync` and `platform` specs and `docs/openspec/changes/offline-sync/` (e.g. the Phase 3 error model without `unsupported_source`, source name fields, Undo-through-outbox wording while Phase 3 delete is confirm-and-wait). Owner OK.
- Service worker: Phase 5 ships a minimal one (app shell and images); this phase adds the data side.
- Light theme pass (owner decision 2026-11-21, moved here from Phase 5): look at the whole UI in light theme in a real browser (768, 1024, 1440; en, ru, uk); only dark was checked so far.

## Phase 11 (Later / parked)

- The default data source control in Settings > Sources is built but stays invisible while each type has a single registered source (`SourcesSection`, `items.length >= 2`); revisit when a second source is added.
- Extra data sources (Goodreads, OMDb were rejected earlier).
- Revisit one Gradle project vs sub-projects only if build time hurts.

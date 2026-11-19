# RWX

Offline-first PWA (React) + Java 25 / Spring Boot 4 modular monolith. Rewrite of the iOS app "I Wanna RWX" (behavioural reference only: `/Users/davs/dev/xcode-ios/book_film_inbox`; no data import).

Decisions and constraints: `docs/ROADMAP.md` (do not re-litigate; if one looks wrong, say so with reasons). Product philosophy: minimal, two taps to any list, no categories/tags/ads/recommendations.

## Stack
- Backend: Java 25, Spring Boot 4, Gradle Kotlin DSL, Spring Modulith, PostgreSQL + JPA + Flyway. OpenAPI-first: `openapi.yaml` is the contract; server interfaces and TS client are generated, never hand-duplicated.
- Frontend: React + TS + Vite, Tailwind, TanStack Query; Dexie (IndexedDB) and Workbox arrive in the Offline/PWA phase 5 (no Dexie in the tree before). Built to static assets served by the Spring jar (one image).
- Auth: GitHub OAuth only (GitHub offers passkeys itself; no passkeys in RWX). Credentials stay a separate per-credential table. Secrets in DB: license keys encrypted AES-GCM with versioned key; data source API keys (TMDb) stored as is for now (owner decision, `docs/TODO.md`), write-only, never returned or logged.
- Deploy: Docker Compose = local only (no proxy/TLS); Helm on k3s (Traefik, cert-manager).
- Offline: server authoritative, IndexedDB = cache + mutation outbox, idempotent writes with client UUIDs, LWW per record by version. iOS PWA: no Background Sync, evictable storage, Web Push only when installed (16.4+).

## OpenSpec workflow
Specs live in `docs/openspec/` (CLI is not installed; Node here is too old, files are maintained by hand in the standard layout).
- `docs/openspec/project.md`: conventions. `docs/openspec/specs/<capability>/spec.md`: current behaviour (media, datasource, reminders, identity, settings, offline-sync, platform).
- `docs/openspec/changes/<id>/`: `proposal.md`, `design.md`, `tasks.md`, `specs/<capability>/spec.md` (ADDED/MODIFIED/REMOVED deltas). Phase 2 (settings and data sources) is archived in `docs/openspec/changes/archive/`. Pending, Phase 3 (media): `media-core`, then `media-search`. `offline-sync` belongs to the Offline/PWA phase (roadmap phase 5); `push-notifications` (placeholder holding the push preference, subscriptions and the Settings switch) belongs to Push (roadmap phase 6). The tree holds only Phases 0-2 (owner decision 2026-11-18); everything else lives in history and `refs/shelf/pre-cleanup`. No mock user or dev login, ever.
- Flow: proposal -> spec delta (+ OpenAPI change) -> tasks -> implementation -> review. Every behavioural change starts as a proposal. After merge, fold the delta into `docs/openspec/specs` and move the change to `docs/openspec/changes/archive/`.
- Specs captured from iOS have an "Open questions" section; resolve it (record the decision in the spec) before implementing that capability. Reminders rules (`docs/openspec/specs/reminders/spec.md`) are mandatory reading before touching reminders, scheduler or push.

## Agents (`.claude/agents`)
- `architect`: designs, OpenSpec artifacts, OpenAPI, sync; writes no production code.
- `backend-dev`: implements a backend task (Spring, JPA, Flyway, scheduler, Testcontainers).
- `frontend-dev`: implements a frontend task (React, Dexie, outbox, service worker).
- `ui-designer` / `ux-reviewer`: visual design and usability review (iOS-like PWA: safe areas, tab bar, sheets, 44pt targets).
- `code-reviewer`: read-only review of a diff against its OpenSpec change.
One task from `tasks.md` per implementer run; tasks are sized for that.

## Conventions
- Per-user isolation: every user-owned table has `user_id`; every query is scoped; cross-user access returns 404; each module has an isolation test.
- Modulith: modules interact only via published APIs/events, never another module's repositories/entities.
- Dates: reminder expiry is `DATE` (`YYYY-MM-DD`), instants are UTC `timestamptz`; the user's IANA timezone is stored server-side and used by the scheduler (09:00 local).
- Writes are idempotent (client UUID ids, `mutationId`); never log secrets or license keys.
- Flyway: V001 is edited in place until the first deploy (no V002 before then, includes the Spring Session tables); migrations are append-only from the first deploy on. Tests use real Postgres (Testcontainers), not mocks.
- Data sources: module `datasource` (defaults and keys under `/data-sources`; `/search/...` is added to the contract in Phase 3, one stored default row per user and type in `user_default_sources`, created with the user via `UserCreatedEvent`; saved keys in `user_source_keys`; no key status); problems about a source use source-agnostic codes (`source_key_*`) and name the source in `Problem.source`. URL parsing and the `@HttpUrl` constraint (put on contract fields with `x-field-extra-annotation`) live in `common.validators`. The draft source: the shared rules are `datasource.internal.AbstractDraftResolver` (link and text rules as static methods, plus identify/resolve), the typed beans next to their sources (`internal.book.BookDraftResolver`, `internal.movie.MovieDraftResolver`): plain `MediaResolver` beans qualified `@Qualifier(MediaResolver.DRAFT)` (the provider catalogs are `@Primary`; the Phase 3 `media` module will inject drafts with the qualifier), a draft ref's `externalId` is its normalized text, and drafts are never in `SourceDirectory`, `/data-sources`, user rows or settings.
- Filters/sort per list are device-local UI state, not synced.
- i18n en/ru/uk. The user's locale is fixed at sign-up (browser Accept-Language on the OAuth callback, `en` if unknown; stored in `user_settings.locale`, never null, changeable in Settings); before sign-in the device locale applies. no emoji in docs/commits unless the product UI needs them.
- `docs/ROADMAP.md` is maintained by the architect; decisions in it are not re-litigated without reason (say so explicitly with reasons).

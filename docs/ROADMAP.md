# RWX — Roadmap

Rewrite of the iOS app "I Wanna RWX" (`/Users/davs/dev/xcode-ios/book_film_inbox`, SwiftUI + SwiftData/CloudKit) as an offline-first PWA with a Java backend.
The iOS app stops working in ~3 months (subscription ends), so it is a **behavioural reference only**, not a long-term sibling.

Product philosophy (kept): minimal, two taps to any list, no categories/tags, no ads, no recommendations, no content download.

## Decisions

| Area | Decision |
|---|---|
| Backend | Java 25, Spring Boot 4, Gradle (Kotlin DSL), modular monolith (Spring Modulith) |
| Persistence | PostgreSQL, Spring Data JPA, Flyway |
| API | **OpenAPI-first**: `openapi.yaml` is the contract; server interfaces and TS client are generated |
| Frontend | React + TypeScript + Vite, Tailwind, TanStack Query, Dexie (IndexedDB), Workbox |
| Packaging | Frontend built to static assets and served by the Spring jar → one image |
| Auth | **GitHub OAuth only** (GitHub itself offers passkeys; RWX implements none). Credentials are a separate per-credential table. No Apple sign-in (needs a paid developer account). No mock user, dev login or any auth bypass, not even locally. Multi-user, data isolated per user |
| Secrets in DB | License keys encrypted at rest (AES-GCM, key from env/Secret, versioned for rotation). The per-user TMDb key is stored as is for now; encryption is to be rethought (see `docs/TODO.md`) |
| TMDb | Each user supplies their own key; stored server-side (as is for now); searches proxied by the backend in the user's locale |
| Offline | Server is source of truth; IndexedDB is cache + mutation outbox; last-write-wins per record using version/`updatedAt` |
| Reminders | Server-side scheduler + Web Push (VAPID). Replaces iOS local notifications |
| Deploy: Compose | Local use only: app + postgres. No reverse proxy, no TLS |
| Deploy: k3s | Helm chart; Traefik Ingress + cert-manager; Actuator probes; Postgres via CloudNativePG or external (TBD) |
| Schema | `V001__initial_schema.sql` is edited in place until the first deploy (no V002 before then; it includes the Spring Session JDBC tables). Append-only from the first deploy on |
| Process | OpenSpec spec-driven; every change = proposal → spec delta → tasks → implementation → review |
| i18n | en / ru / uk, device locale only (as today) |
| Design | Rebuilt from scratch, same philosophy |

## iOS PWA constraints (drive the design)

- Web Push on iOS works only for installed (Home Screen) PWAs, iOS 16.4+. Needs an in-app install walkthrough.
- No Background Sync / Periodic Sync: sync on app open, `online` event, and a timer while open.
- IndexedDB may be evicted: call `navigator.storage.persist()`, never treat local data as authoritative.
- GitHub OAuth accepts `http://localhost` callbacks, so local dev works with a real GitHub OAuth App. Tests authenticate through a test-only helper under `src/test`, never a production bypass.
- "Almost native" = standalone display, safe-area insets, bottom tab bar, sheet-style modals, no hover-only UI, 44pt targets, no pull-to-refresh fights.

## Domain (from the iOS app)

- **Book / Movie** (movie includes TV series): title, description, source (OpenLibrary / TMDb / draft), sourceId, status (`planned`/`seen`), cover URL, year, rating, favorite, `updatedAt`; books add author and ISBN, movies add type (movie/tv), original title, TV series status and seasons (movies have no author). The rating is the source's, not the user's. "Draft" = item added manually without a source match.
- **Reminder**: type (subscription/license), name, description, renewal (none/monthly/yearly/lifetime/custom period), expiry date (not for lifetime), license key (multi-line), reminder days before expiry, cost, notes. Renewal ("prolongate") and notification time (09:00, fallback today → tomorrow, never after expiry) are specified in `docs/openspec/specs/reminders/spec.md`. Reference: `Features/Reminders/Domain/ReminderSchemaV100.swift`, `Core/Services/NotificationService.swift`.
- **Filters**: tri-state (all/include/exclude) favorite/seen/draft, movie vs TV toggle, reminders by type / expiring soon. Remembered per list on the device (not synced), evaluated on the client. Default hides "seen". Counts shown as `shown of total`.
- **Other behaviours**: tap cover → open source page; tap card → detail with the full description. No JSON export.

## Phases

0. **Foundations** (done 2026-11-17, see `docs/phase-0.md`) — OpenSpec; capability specs (media, search, reminders, identity, settings, offline-sync, platform); contract and schema baseline; design system; agents in `.claude/agents`; CLAUDE.md.
1. **Skeleton** — Gradle layout, Spring Boot 4 app, Postgres + Flyway baseline, OpenAPI codegen pipeline, Vite app, CI, Docker Compose (local).
2. **Identity** (`identity-github-oauth`) — GitHub OAuth with open sign-up: login page, Spring Session JDBC session, home with username + logout, `/me` and settings API, account deletion and data export, isolation test kit.
3. **Media** (`media-core`, `media-search`) — online-first: books/movies CRUD through the API with TanStack Query (no Dexie, outbox or sync yet), OpenLibrary + TMDb search proxy, per-user TMDb key, filters, counts.
4. **Reminders** — online-first CRUD, renewal/prolongate logic, encrypted license key.
5. **Offline/PWA** (`offline-sync`) — the only phase that introduces Dexie, the mutation outbox and sync: manifest, service worker, Dexie cache, outbox sync, conflict handling, install flow, offline Playwright suite.
6. **Push** — VAPID, subscription management, scheduler, notification actions (prolongate).
7. **Ops / CI** — Helm chart for k3s (Ingress, cert-manager), observability, Postgres backups. CI derives the version from git tags, stamps it on the image and in the app, and publishes the single image to GHCR (see `docs/TODO.md`).
8. **Polish** — i18n en/ru/uk, design pass, accessibility, iOS device QA.
9. **Later / parked** — extra data sources (Goodreads/OMDb were rejected earlier); Import from the iOS app is **dropped**: items will be re-added by name via search; the iOS export is not changed.

## Open items

- Postgres on k3s: CloudNativePG vs external.
- Encryption of the TMDb key: to be rethought.
- Everything else open lives in `docs/TODO.md`.

## Decisions from the Phase 0 specs

All questions from the iOS-derived specs were answered on 2026-11-17 and are recorded in the specs ("Decisions (formerly open)").

1. Prolongate on an overdue reminder adds one period to the old expiry (may stay overdue).
2. Renewal `none` is a one-off expiry without prolongate; the expiry is required for every non-lifetime reminder.
3. iOS Web Push has no action buttons: tap → open reminder → press "Renewed".
4. A notification missed because the server was down is sent late, until the end of the expiry day.
5. Switching a reminder to lifetime cancels its pending notification.
6. The card opens a detail on tap, also without a description.
7. Book duplicates: ISBN, plus source id; a draft title is checked against all items, case-insensitively.
8. Filter and sort memory stays per device, not synced.
9. Title sort is case-insensitive and locale-aware; the reminders list is ordered by expiry and has no server-side sort.
10. Sign-up is open (no allow-list, no invitations); account deletion and data export are provided.
11. TMDb results use the user's locale; disabling push removes the flag and the subscriptions.

Decided: if the user has not enabled notifications, show a one-time hint as in the iOS app; nothing else (no repeated nags, no fallback channel).

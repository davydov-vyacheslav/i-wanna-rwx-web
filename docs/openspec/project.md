# RWX project context

Offline-first PWA (React) + Java 25 / Spring Boot 4 modular monolith. Rewrite of the iOS app "I Wanna RWX", which is a **behavioural reference only** (no data import). Decisions live in `docs/ROADMAP.md`; do not duplicate them here.

## Stack
Java 25, Spring Boot 4, Gradle (Kotlin DSL), Spring Modulith, PostgreSQL + JPA + Flyway, OpenAPI-first (`openapi.yaml` generates server interfaces and the TS client), React + TS + Vite + Tailwind + TanStack Query (Dexie and Workbox arrive in the Offline/PWA phase 5). Docker Compose (local only), Helm on k3s.

## Conventions for specs
- `docs/openspec/specs/<capability>/spec.md` = current behaviour (source of truth once a change is archived).
- `docs/openspec/changes/<id>/` = proposal.md, design.md (optional), tasks.md, specs/<capability>/spec.md with `## ADDED|MODIFIED|REMOVED Requirements` deltas.
- Requirements use SHALL; each has at least one `#### Scenario:` with WHEN/THEN.
- Specs captured from iOS carry a `## Open questions` section: places where iOS behaviour is ambiguous or looks like a bug. They MUST be resolved (decision recorded in the spec) before the capability is implemented.
- Dates in reminders are calendar dates (`LocalDate`), instants are UTC; the user's IANA timezone is stored server-side.
- All user data is scoped by `user_id` on every query.
- Published module events are named with an `Event` suffix (`UserCreatedEvent`).

## Schema
`V001__initial_schema.sql` is edited in place until the first deploy (no `V002` before then; it includes the Spring Session JDBC tables). From the first deploy on, Flyway migrations are append-only.

## Capabilities (current iOS behaviour, adapted)
media, datasource (formerly `search`), reminders, identity, settings, offline-sync, platform (target behaviour of the PWA; iOS is a reference only)

## Pending changes
Phase 2 (user settings and data sources) is done and archived in `changes/archive/`: `settings-module`, `settings-screen`, `datasource-defaults`, `datasource-simplification`, `datasource`. Pending, Phase 3 (media): `media-core`, `media-search`. `offline-sync` belongs to the Offline/PWA phase (roadmap phase 5), not to these sequences. `project-skeleton` and `identity-github-oauth` are archived too. There is no mock user or dev login anywhere; tests authenticate through a test-only helper. Schema (`V001`) and `api/openapi.yaml` are the source of truth; change docs must be aligned to them (see `docs/TODO.md`).

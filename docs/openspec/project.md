# RWX project context

Offline-first PWA (React) + Java 25 / Spring Boot 4 modular monolith. Rewrite of the iOS app "I Wanna RWX", which is a **behavioural reference only** (no data import). Decisions live in `docs/ROADMAP.md`; do not duplicate them here.

## Stack
Java 25, Spring Boot 4, Gradle (Kotlin DSL), Spring Modulith, PostgreSQL + JPA + Flyway, OpenAPI-first (`openapi.yaml` generates server interfaces and the TS client), React + TS + Vite + Tailwind + TanStack Query + Dexie + Workbox. Docker Compose (local only), Helm on k3s.

## Conventions for specs
- `docs/openspec/specs/<capability>/spec.md` = current behaviour (source of truth once a change is archived).
- `docs/openspec/changes/<id>/` = proposal.md, design.md (optional), tasks.md, specs/<capability>/spec.md with `## ADDED|MODIFIED|REMOVED Requirements` deltas.
- Requirements use SHALL; each has at least one `#### Scenario:` with WHEN/THEN.
- Specs captured from iOS carry a `## Open questions` section: places where iOS behaviour is ambiguous or looks like a bug. They MUST be resolved (decision recorded in the spec) before the capability is implemented.
- Dates in reminders are calendar dates (`LocalDate`), instants are UTC; the user's IANA timezone is stored server-side.
- All user data is scoped by `user_id` on every query.

## Capabilities (current iOS behaviour, adapted)
media, search, reminders, identity, settings, offline-sync, platform (target behaviour of the PWA; iOS is a reference only)

## Pending changes
In implementation order: `mock-user`, `media-core`, `media-search`, `offline-sync`. `project-skeleton` is archived. `identity-github-oauth` is postponed (it replaces the mock user later). Schema (`V001`) and `api/openapi.yaml` are the source of truth; change docs must be aligned to them (see `docs/TODO.md`).

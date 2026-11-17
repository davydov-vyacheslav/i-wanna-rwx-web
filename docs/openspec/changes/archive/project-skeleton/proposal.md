# Change: project-skeleton

## Why
Phase 1 of the roadmap. Nothing can be built in parallel until the repo layout, the contract-first pipeline and CI exist. The skeleton proves the whole chain: `openapi.yaml` -> generated Java interfaces + generated TS types -> Spring app on Postgres/Flyway (V001) -> React shell -> one Docker image -> compose -> CI. The only runtime probe is Actuator health; there is no application ping endpoint.

## What changes
- Repo layout: `backend/` (Gradle Kotlin DSL, wrapper, Spring Boot 4, Spring Modulith), `frontend/` (Vite + React + TS + Tailwind + TanStack Query + Dexie), `api/openapi.yaml` (contract), `deploy/docker/` (`Dockerfile`, `docker-compose.yml`, `.env.example`), `.github/workflows/ci.yml`, `api/redocly.yaml`, `frontend/.node-version`, design tokens in `frontend/src/theme.css`.
- Flyway: `V001__initial_schema.sql` is the single schema (edited in place until the first release, append-only from now on).
- Codegen: server interfaces (`interfaceOnly`) and TS types/client from the same `api/openapi.yaml`.
- Liveness and readiness through Actuator (`/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness`), public. The earlier `GET /api/v1/ping` was dropped by owner decision.
- Frontend built to static assets and served by the Spring jar; SPA fallback.
- CI: backend tests (Testcontainers), frontend lint/typecheck/test/build, OpenAPI lint, image build.

## Impact
New capability `platform` (Actuator health, static serving, schema). No auth yet; the `identity-github-oauth` change adds Spring Security and will protect everything except `/actuator/health` and its probes. Status: largely implemented and being closed; open items are I4 (first CI run), I5 and I6 (see tasks). On completion the change is moved to `docs/openspec/changes/archive/`.

## Non-goals
Auth/security, domain modules, PWA manifest/service worker/Workbox (Phase 5), Helm (Phase 7), i18n, design system, Playwright e2e (Phase 5), release/publish pipeline, observability beyond Actuator health.

Spec deltas were folded into `specs/platform`.

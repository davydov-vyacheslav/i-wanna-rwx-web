# Tasks: project-skeleton

Each task = one implementer run. Tracks are independent: both start from `api/openapi.yaml` (already in the repo) and `design.md`. Root files `.gitignore`, `.editorconfig`, `api/openapi.yaml` and `frontend/.node-version` already exist; do not recreate. Do not touch the other track's directory.

## Track B: backend (agent: backend-dev), all work under `backend/`

- [x] B1 Gradle project + wrapper. Create `settings.gradle.kts` (`rootProject.name = "rwx"`, `pluginManagement` with `gradlePluginPortal()` + `mavenCentral()`), then generate the wrapper with the docker command in design §3 (Gradle 9.9.1, sha256 pinned), add `.gitattributes`. Verify: `cd backend && ./gradlew --version` prints Gradle 9.9.1 on the local JDK 25; wrapper jar checksum matches design §3.
- [x] B2 Build script + app shell. `build.gradle.kts` + `gradle/libs.versions.toml`: Java 25 toolchain, Boot 4.1.2 plugin, dependency-management, `spring-modulith-bom` 2.1.2, dependencies per design §3, `bootJar` name `rwx.jar`, `buildInfo()`. `RwxApplication`, `application.yaml`, `application-dev.yaml`. Verify: `./gradlew build -x test` succeeds; resolution of Modulith 2.1.2 against Boot 4.1.2 works (if not, report the compatible Modulith version, do not guess).
- [x] B3 OpenAPI server codegen. Wire `org.openapi.generator` 7.27.0 `openApiGenerate` from `../api/openapi.yaml` with the options in design §3, output `build/generated/openapi`, added to main source set and a `compileJava` dependency; hand-written `com.javanix.rwx.api.package-info.java` with `@ApplicationModule(type = OPEN)`. Verify: `./gradlew compileJava` produces the generated API interfaces and models (originally `SystemApi`/`Ping`, since removed with ping), no generated files tracked by git. Spike outcome on Jackson 3 compatibility (design §3 risk) recorded in a short note appended to design.md.
- [x] B4 Flyway + Testcontainers harness. `V001__initial_schema.sql` (single schema), `TestcontainersConfiguration` (postgres:18-alpine), a `@SpringBootTest` `ContextLoadsTests` asserting `flyway_schema_history` has version 1 and Hibernate `validate` passes. Verify: `./gradlew test` green with Docker running.
- [x] B5 Modulith verification. `ModularityTests` (`ApplicationModules.verify()`), `com.javanix.rwx.system` package with a `package-info.java` documenting it as a module. Verify: test passes; temporarily adding a forbidden cross-module import fails it (do not commit that).
- [x] B6 Ping endpoint. Implemented, then removed by owner decision; superseded by B9 (Actuator health). No ping endpoint exists.
- [x] B7 Problem details + unknown API path. Enable problem details; ensure unmapped `/api/**` returns 404 `application/problem+json`. Test it. Verify: `./gradlew test`.
- [x] B8 Static serving + SPA fallback. `processResources` with `-PfrontendDist`, resource handler and cache headers per design §3 (spec `platform` scenarios Deep link / Unknown API path). Test with a temp `static/index.html` fixture on the test classpath (`src/test/resources/static/index.html`, not packaged in main). Verify: `./gradlew test`; `./gradlew bootJar -PfrontendDist=<dir with index.html>` jar contains `BOOT-INF/classes/static/index.html`.
- [x] B9 Actuator probes. Expose `health,info`, probes enabled; test `/actuator/health`, `/liveness` and `/readiness` are 200 UP. This is the only health surface. Verify: `./gradlew test`.

## Track F: frontend (agent: frontend-dev), all work under `frontend/`; use `eval "$(fnm env --shell zsh)"; fnm use 24` in non-interactive shells

- [x] F1 Vite scaffold. `package.json` (exact pinned versions from design §1, no `^`), `package-lock.json`, `vite.config.ts` (proxy `/api`, `/actuator` to :8080), `tsconfig*.json` (strict), `index.html`, `src/main.tsx`, `App.tsx` placeholder, scripts per design §5. Verify: `npm ci && npm run build` succeeds; `dist/index.html` exists.
- [x] F2 Tailwind 4. `@tailwindcss/vite`, `src/index.css`, viewport meta with `viewport-fit=cover`, safe-area padding utility on the root container. Verify: build output CSS contains a utility used by `App.tsx`.
- [x] F3 Lint + typecheck. ESLint 10 flat config, typescript-eslint, react-hooks; `lint` and `typecheck` scripts. Verify: both pass on a clean tree and `lint` fails on an introduced unused variable (not committed).
- [x] F4 Typed API client. `api:gen` with openapi-typescript from `../api/openapi.yaml`, `pre*` hooks, `src/api/client.ts` (`createClient<paths>`, injectable fetch). Verify: fresh clone + `npm ci && npm run typecheck` works with no committed schema file; changing a field name in a scratch copy of the yaml breaks typecheck (do not commit).
- [x] F5 TanStack Query. Provider and defaults per design §5 (`src/queryClient.ts`). The `usePing()` hook was removed with ping.
- [x] F6 Dexie wiring. `src/db/db.ts` (db `rwx` v1, `meta` table). Verify: Vitest with `fake-indexeddb` writes and reads a `meta` key.
- [x] F7 Ping page. Implemented, then removed with ping; the frontend currently has no ping UI. `App.tsx` is a shell with a Testing Library test.
- [x] F8 Vitest setup. `vitest.config` (jsdom, setup file, `fake-indexeddb/auto`), `test` script, passes in CI mode. Verify: `npm test -- --run` green. (Do F8 before F5-F7 if tests need it; order F1, F2, F3, F8, F4, F5, F6, F7.)
- [x] F9 Frontend README section: how to run dev against a backend on :8080 (append to `frontend/README.md`, 10 lines max). Verify: commands in it work.

## Track I: integration (after B1-B9 and F1-F8 are merged; one agent, sequential)

- [x] I1 OpenAPI lint. `api/redocly.yaml` (`extends: recommended`), root `package.json` NOT created; run via `npx @redocly/cli@2.78.0 lint api/openapi.yaml --config api/redocly.yaml`. Fix findings in the yaml only with the architect's agreement. Verify: command exits 0.
- [x] I2 Dockerfile + `.dockerignore`. `deploy/docker/Dockerfile` and root `.dockerignore`, multi-stage per design §6. Verify: the image builds from the repo root with `-f deploy/docker/Dockerfile`; a container against a Postgres (I3) returns the SPA on `/` and 200 `UP` on `/actuator/health`; image runs as non-root.
- [x] I3 `deploy/docker/docker-compose.yml` + `deploy/docker/.env.example`. Per design §6. Verify: `docker compose -f deploy/docker/docker-compose.yml up --build -d`, then `curl localhost:8080/actuator/health` returns 200 `UP`, `curl localhost:8080/some/deep/link` returns the index page, `docker compose down -v` cleans up.
- [ ] I4 (deferred to Phase 1, tracked in docs/TODO.md) CI workflow. `.github/workflows/ci.yml` per design §7, four jobs (workflow exists). OPEN: `actionlint` clean (via docker `rhysd/actionlint` if not installed) and the first push to GitHub is green.
- [ ] I5 (deferred to Phase 1, tracked in docs/TODO.md; owner runs it) Manual check through `/actuator/health`: with compose up, `GET http://localhost:8080/actuator/health` returns 200 `UP` and `http://localhost:8080` shows the app shell. No service worker yet, so an offline hard reload is expected to fail until Phase 5. Record the result in design section 11.
- [x] I6 Root `README.md` (20 lines max): prerequisites, the three dev loops, repo layout, link to `docs/ROADMAP.md` (README exists; verify it covers these). Then archive: move `docs/openspec/changes/project-skeleton/` to `docs/openspec/changes/archive/` (the platform spec is already folded). Verify: reviewer sign-off by `code-reviewer`.

## Closing
Archived 2026-11-17 with I4 (first CI run) and I5 (manual `/actuator/health` check) deferred to Phase 1 by owner decision; see docs/TODO.md.

# Design: project-skeleton

Versions verified 2026-11-15 against Maven Central, Gradle Plugin Portal, npm registry, services.gradle.org, GitHub releases.

## 1. Pinned versions

| Item | Pin | Note |
|---|---|---|
| Java | 25 (toolchain) | local JDK 25.0.5; CI `actions/setup-java` temurin 25 |
| Spring Boot | **4.1.2** | latest stable (4.2.0-RC2 exists; not used) |
| Spring Modulith | **2.1.2** | not managed by Boot; import `spring-modulith-bom`. Verify it resolves with Boot 4.1.2 (task B2) |
| Gradle | **9.9.1** (wrapper) | `distributionSha256Sum` d8a18a7a841dd5df825d35a685fad6f2d7f12ac0c280e57b67c27b4a520ba228 |
| openapi-generator Gradle plugin `org.openapi.generator` | **7.27.0** | from Gradle Plugin Portal. Maven Central only has 7.14.0 for this artifact; resolve plugin via `gradlePluginPortal()` in `pluginManagement` |
| PostgreSQL image | **postgres:18-alpine** | same tag in compose and Testcontainers (single constant) |
| Testcontainers / PG driver / Flyway | managed by Boot BOM | do not pin |
| Node | 24 (`frontend/.node-version`) | local `v24.22.3` |
| vite | 8.3.8 | |
| react / react-dom | 19.3.1 | |
| @vitejs/plugin-react | 6.3.0 | |
| typescript | **6.0.3** | NOT 7.0.2: `typescript-eslint` 8.72.2 peers `typescript <6.1.0` |
| typescript-eslint / eslint / eslint-plugin-react-hooks | 8.72.2 / 10.15.0 / 7.1.1 | flat config |
| tailwindcss + @tailwindcss/vite | 4.3.5 | CSS-first config, no `tailwind.config.js` |
| @tanstack/react-query | 5.107.1 | |
| dexie / dexie-react-hooks | 4.4.7 / 4.4.0 | |
| openapi-typescript / openapi-fetch | 7.13.0 / 0.17.0 | types only + 2 KB typed fetch; no runtime-generated client |
| vitest / jsdom / @testing-library/react / fake-indexeddb | 5.1.0 / 31.0.1 / 16.3.3 / 6.2.8 | |
| @redocly/cli | 2.78.0 | OpenAPI lint (CI + `npm run api:lint`) |
| GH Actions | checkout v7, setup-java v6, setup-node v7, gradle/actions/setup-gradle v6, docker/build-push-action v7 | majors only |

Implementers: use exact versions in `package.json` (no `^`) and commit `package-lock.json`. Re-check on implementation day; bump patch only.

## 2. Repo layout

Top level: `api/openapi.yaml` (contract), `backend/` (single Gradle project with wrapper committed, Spring app under `src/main/java/com/javanix/rwx`, config and Flyway migrations under `src/main/resources`, tests under `src/test`), `frontend/` (Vite app, `.node-version`, design tokens in `src/theme.css`, generated `src/api/schema.d.ts` gitignored), `deploy/docker/` (Dockerfile, compose, `.env.example`), `.github/workflows/ci.yml`, `docs/` (design, openspec, ROADMAP, TODO), plus `.gitignore`, `.editorconfig`. `api/` also holds `redocly.yaml`. `src/main/java/com/javanix/rwx/api` is the generated-code package (an OPEN module) and `system` is the first module.

Decisions:
- **One Gradle project, not multi-project.** Modulith modules are packages; Gradle sub-projects would not enforce them and add build cost. Revisit only if build time hurts.
- **Base package `com.javanix.rwx`**; module = direct subpackage (`com.javanix.rwx.system`, later `identity`, `media`, `reminders`, `push`, `sync`). Module-internal types live in sub-packages (`internal`, not exported); the module's root package is its published API. Cross-module calls go through root-package interfaces or events only; `ModularityTests` runs `ApplicationModules.of(RwxApplication.class).verify()` from the first commit.
- **Generated code package `com.javanix.rwx.api`** (`com.javanix.rwx.api` for interfaces, `com.javanix.rwx.api.model` for DTOs), output in `backend/build/generated/openapi`, never committed. `com.javanix.rwx.api` is declared `@ApplicationModule(type = OPEN)` in a hand-written `package-info.java` so every module may depend on it. Trade-off: one shared DTO package couples modules to one namespace; accepted because DTOs are the wire contract and JPA entities stay private to modules. Alternative (split yaml per module, one generation run each) is possible later and does not change the module API.
- Controllers live in their module and implement the generated interface of their tag (for example a later `media` controller implements the `media` API). The `system` module currently has no controller.

## 3. Backend

The actuator exposure and virtual threads notes below are historical (current: only `health` is exposed, no virtual threads flag).

Dependencies: `spring-boot-starter-web` (MVC; virtual threads on via `spring.threads.virtual.enabled=true`), `starter-actuator`, `starter-data-jpa`, `starter-flyway` + `org.flywaydb:flyway-database-postgresql` (Boot 4 split Flyway auto-config into its own starter), `postgresql`, `spring-modulith-starter-core`, `jakarta.validation` + `swagger-annotations` (required by generated code). Test: `starter-test`, `spring-boot-testcontainers`, `testcontainers-postgresql`, `spring-modulith-starter-test`. Not added now: Spring Security (identity change), springdoc (the yaml is the contract; no runtime-derived docs).

Config:
- `spring.jpa.hibernate.ddl-auto=validate`, `spring.jpa.open-in-view=false`, `spring.flyway.enabled=true`, Flyway `baseline-on-migrate=false`.
- `management.endpoints.web.exposure.include=health,info`; `management.endpoint.health.probes.enabled=true` (readiness/liveness for Helm later); `/actuator/health` (with `/liveness` and `/readiness`) is the only health surface; there is no application ping.
- Datasource from env: `SPRING_DATASOURCE_URL|USERNAME|PASSWORD`; defaults in `application-dev.yaml` only (localhost compose DB). No defaults for production profile. No secrets in the repo.
- `build-info` via `springBoot { buildInfo() }`, exposed by the `info` actuator endpoint.
- Errors: `spring.mvc.problemdetails.enabled=true` -> RFC 9457 `application/problem+json` for framework exceptions (incl. 404 for unmapped `/api/**`; handler must not forward to index.html).

openapi-generator config (`openApiGenerate` task, wired into `compileJava`):
`generatorName=spring`, `library=spring-boot`, `interfaceOnly=true`, `useSpringBoot3=true` (Jakarta namespace; keep until a Boot-4 flag exists), `useTags=true`, `apiPackage=com.javanix.rwx.api`, `modelPackage=com.javanix.rwx.api.model`, `delegatePattern=false`, `skipDefaultInterface=true`, `useBeanValidation=true`, `openApiNullable=false`, `documentationProvider=none`, `annotationLibrary=none`, `dateLibrary=java8` (`OffsetDateTime`), `generateSupportingFiles=false`, `useResponseEntity=true`. Add the output dir to `sourceSets.main.java`.
**Risk (Jackson 3):** Boot 4 uses Jackson 3 (`tools.jackson`), the generator may emit Jackson 2 imports. `jackson-annotations` stays in `com.fasterxml.jackson.annotation` in Jackson 3, so annotation-only DTOs work; `openApiNullable=false` avoids the databind-nullable dependency. Task B3 is a spike: if generated models do not compile or serialize, fall back to `serializationLibrary`/template override and record it here.

Wrapper without a local Gradle (task B1): run `gradle wrapper --gradle-version 9.9.1 --distribution-type bin` with the Gradle SHA-256 above passed as `--gradle-distribution-sha256-sum`, inside the `gradle:9.9.1-jdk25` image with `backend/` mounted as the working directory.
(Needs an existing `settings.gradle.kts`; create it first; fix file ownership with `chown` on Linux). Commit `gradlew`, `gradlew.bat`, `gradle/wrapper/*`. Then run `./gradlew --version` with the local JDK 25 to prove it. Add a `.gitattributes` line `*.bat text eol=crlf`. Check `gradle-wrapper.jar` against the published wrapper checksum 621008afc4f5d59357fcf06ffa644dd5aade5e091bdc363742710445f73cdaf8 (`https://services.gradle.org/distributions/gradle-9.9.1-wrapper.jar.sha256`).

Static serving: the frontend build output is copied into the jar at `classpath:/static`. Gradle: `processResources { from(providers.gradleProperty("frontendDist")) { into("static") } }`; without the property the jar has no UI (dev and backend CI do not need it). SPA fallback: a `WebMvcConfigurer` resource handler resolving unknown paths that are not `/api/**` or `/actuator/**` to `static/index.html`, with `Cache-Control: no-cache` for `index.html` and long immutable cache for `/assets/**` (Vite hashed files). Located in `com.javanix.rwx.web` package-level config of the root package (not a module).

Flyway: `V001__initial_schema.sql` holds the full schema (users, books, movies, subscriptions, licenses, settings, applied_mutations (no server outbox table: the outbox is client-side), push_subscriptions and the sync sequence and trigger). It was edited in place while nothing was deployed; from now on migrations are append-only, naming `V<nnn>__<snake_case>.sql` (zero-padded). Hibernate runs with `validate`.

Testcontainers: shared `TestcontainersConfiguration` (`@TestConfiguration(proxyBeanMethods=false)`, `@ServiceConnection PostgreSQLContainer("postgres:18-alpine")`), reused by `@SpringBootTest`. Integration tests suffixed `IT` or `Tests`; one Gradle `test` task is enough for now.

## 4. API contract (`api/openapi.yaml`)

The contract is owned by the feature changes (media, reminders, settings, sync, identity); the skeleton defines only the rules. The skeleton originally shipped a `GET /api/v1/ping` proof endpoint; the owner removed it and Actuator replaced it, so the contract has no `system` tag and the generated `SystemApi` no longer exists.
Rules for all changes: base path `/api/v1` is in each path (not in `servers`) so same-origin static serving and the Vite proxy need no rewriting; errors are always `Problem`; instants are RFC 3339 UTC; dates are `format: date`; ids are `format: uuid`; every operation has an `operationId` and exactly one tag; tag = module.
Lint: `redocly lint api/openapi.yaml --config api/redocly.yaml` (config in `api/`, `extends: recommended`, with the rule exceptions listed in section 11).

## 5. Frontend

- Vite 8 + `@vitejs/plugin-react` + `@tailwindcss/vite`; `index.css` imports Tailwind and `theme.css` (design tokens). Single page, no router yet (router choice deferred to the first feature change; do not add it now).
- API client: `npm run api:gen` = `openapi-typescript ../api/openapi.yaml -o src/api/schema.d.ts`; `src/api/client.ts` exports `createClient<paths>({ baseUrl: "" })`. Hooked as `predev`, `prebuild`, `pretypecheck`, `pretest`, `prelint` so a fresh clone works after `npm ci`. Output is gitignored (the contract is the committed artifact).
- TanStack Query: `QueryClientProvider` in `main.tsx`; Defaults: `networkMode: "offlineFirst"`, `staleTime: 30s`, `retry: 1`.
- Dexie: `src/db/db.ts` opens database `rwx` schema version 1 with one table `meta` (`key` primary). It proves the wiring only; the real schema belongs to `offline-sync`. The frontend currently has no ping UI and no network-status UI.
- Dev: `vite.config.ts` `server.proxy` `/api` and `/actuator` -> `http://localhost:8080`; build `outDir=dist`, `target=es2023`. No Workbox/PWA plugin now.
- Lint: ESLint 10 flat config + typescript-eslint (`strictTypeChecked` off, `recommended` on) + react-hooks. Tests: Vitest + jsdom + Testing Library + fake-indexeddb; the client is built with an injectable `fetch` so tests do not need MSW.
- Scripts: `dev`, `build` (`tsc -b && vite build`), `lint`, `typecheck`, `test`, `api:gen`, `api:lint`.

## 6. Packaging and local run

`deploy/docker/Dockerfile` (multi-stage; build context is the repo root, compose sets `context: ../..`):
1. `node:24-alpine` `frontend-build`: copy `api/` and `frontend/`, `npm ci`, `npm run build` -> `/app/frontend/dist`.
2. `gradle:9.9.1-jdk25` `backend-build`: copy `backend/`, `api/`, `--from=frontend-build` dist to `/frontend-dist`; run `./gradlew bootJar -PfrontendDist=/frontend-dist --no-daemon` (uses the wrapper so the version is the one in the repo; the image only supplies JDK 25). BuildKit cache mounts for `~/.gradle` and `~/.npm`.
3. `eclipse-temurin:25-jre` runtime: non-root user, `COPY` jar, `EXPOSE 8080`, `ENTRYPOINT ["java","-jar","/app/rwx.jar"]`, `HEALTHCHECK` not set (compose/Helm do it with the actuator).
`bootJar` archive name fixed to `rwx.jar`. `.dockerignore` excludes `node_modules`, `build`, `.gradle`, `.git`, `frontend/dist`.

`deploy/docker/docker-compose.yml` (local only; no proxy/TLS): `postgres` (`postgres:18-alpine`, named volume at `/var/lib/postgresql` as required by the 18 image, `pg_isready` healthcheck, port bound to `127.0.0.1:5432`) and `app` (build context repo root with `dockerfile: deploy/docker/Dockerfile`, `depends_on: postgres: condition: service_healthy`, env `SPRING_DATASOURCE_*`, `SPRING_PROFILES_ACTIVE=dev`, port `127.0.0.1:8080`, no app healthcheck because the JRE image has no `wget`/`curl`; `restart: unless-stopped` covers crashes, Helm will use Actuator probes). Credentials come from `.env` (copy of committed `deploy/docker/.env.example`, which holds throwaway local values).
Developer loop: `docker compose up -d postgres` + `./gradlew bootRun --args=--spring.profiles.active=dev` + `npm run dev` (hot reload on :5173 with proxy), or `docker compose -f deploy/docker/docker-compose.yml up --build` for the single-image check on :8080.

## 7. CI (`.github/workflows/ci.yml`, triggers: push to main, pull_request)

Jobs run in parallel, no cross-dependencies except `image`:
- `backend`: checkout, `setup-java` temurin 25, `gradle/actions/setup-gradle`, `./gradlew test` in `backend/` (Testcontainers uses the runner Docker). Uploads test reports on failure.
- `frontend`: checkout, `setup-node` with `node-version-file: frontend/.node-version` and npm cache, `npm ci`, `lint`, `typecheck`, `test`, `build` in `frontend/`.
- `openapi`: `npx @redocly/cli@2.78.0 lint api/openapi.yaml --config api/redocly.yaml`.
- `image` (needs backend, frontend, openapi): `docker/build-push-action` with `push: false`, GHA cache; proves the multi-stage build.
No deploy, no publish. Permissions `contents: read`. `concurrency` cancels superseded PR runs.

## 8. Trade-offs and rejected options
- Committing generated code (rejected: drift/noisy diffs; the build is the check). Committing the TS schema would help editors on clone but `npm ci` + `pre*` hooks cover it.
- Generated full TS client (`openapi-generator typescript-fetch`, rejected: heavier, second generator toolchain, JVM needed in the frontend build). `openapi-typescript` needs only Node, which keeps the frontend Docker stage JVM-free and the tracks independent.
- springdoc code-first (rejected by roadmap).
- Gradle multi-project (rejected, see §2).
- TypeScript 7 (rejected until typescript-eslint supports it).

## 9. Open points for the owner
1. Base package `com.javanix.rwx` (confirmed by the owner; org com.javanix).
2. PostgreSQL 18 vs 17: 18 chosen (current, image path change handled). Say if you prefer 17 for the k3s/CloudNativePG decision later.

## 10. Spike notes (Track B)
Historical: the spikes were run with the ping endpoint, which was later removed; the findings about the generator and Jackson 3 still hold.
- B2: `spring-modulith-bom` 2.1.2 resolves and runs with Boot 4.1.2 (no version change). Boot 4 starter names used: `spring-boot-starter-webmvc` (not `-web`), `spring-boot-starter-webmvc-test`; `@AutoConfigureMockMvc` is `org.springframework.boot.webmvc.test.autoconfigure`; Testcontainers 2 classes are `org.testcontainers.postgresql.PostgreSQLContainer`. `swagger-annotations` pinned to 2.2.30 in build.gradle.kts (not Boot-managed).
- B3 (Jackson 3): works without template changes. With `useSpringBoot3=true`, `openApiNullable=false`, `annotationLibrary=none`, generated code imports only `com.fasterxml.jackson.annotation.*` (unchanged in Jackson 3) plus jakarta/spring; it compiles and serializes (PingIT asserts the JSON). Gradle plugin 7.27.0 uses typed properties: `inputSpec` is a `RegularFileProperty`, `outputDir` a `DirectoryProperty`; `generateSupportingFiles` is not a task property, use `globalProperties = mapOf("apis" to "", "models" to "", "supportingFiles" to "false")`.
- The generated `ping()` returns `ResponseEntity<Ping>`, so the 503 problem is produced by throwing `ResponseStatusException` (rendered as problem+json), not by returning a `Problem` body.
- SPA: Boot's static mapping is disabled (`spring.web.resources.add-mappings=false`); `StaticResourcesConfig` owns `/**`. `/` is served via Boot's welcome page forward to `index.html`.

## 11. Deviations and verification (Track I)
- `frontend/.npmrc` sets `legacy-peer-deps=true`: openapi-typescript 7 peers TypeScript 5 while we pin 6.0.3. `npm ci` reads it from `frontend/`, so the Dockerfile and CI run `npm ci` with that working directory and need no flag.
- `api/redocly.yaml` turns off `operation-4xx-response`, `security-defined` and `info-license` (private project); `openapi.yaml` is untouched by the lint config. Re-enable `security-defined` when identity-github-oauth adds security schemes.
- CI `image` job uses setup-buildx and `docker/build-push-action` as in section 7; `actionlint` was not run locally (not installed, docker run was blocked in the agent sandbox). The first real CI run (I4) is still open.
- Verification done through compose: the app served index.html on `/` with `Cache-Control: no-cache`, the SPA fallback worked on a deep link, and the container ran as uid 999 `rwx`. These were first run against the ping endpoint; the health check below replaces it.
- I5 (open, manual): with compose up, `GET /actuator/health` returns 200 `UP` and `http://localhost:8080` loads the app shell. No service worker exists yet, so an offline hard reload is expected to fail until Phase 5. Record the result here when done.

## 12. Closing
Archived 2026-11-17. I4 (first CI run) and I5 (manual `/actuator/health` check) are deferred to Phase 1 by owner decision and tracked in `docs/TODO.md`; the `platform` spec is folded into `docs/openspec/specs/platform`.

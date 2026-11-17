# RWX

Offline-first PWA (React) + Spring Boot 4 / Java 25 modular monolith. Decisions: [docs/ROADMAP.md](docs/ROADMAP.md).

Prerequisites: JDK 25, Node 24 (`frontend/.node-version`), Docker.

Dev loops:
1. Backend: `docker compose -f deploy/docker/docker-compose.yml up -d postgres`, then `cd backend && ./gradlew bootRun --args=--spring.profiles.active=dev`
2. Frontend (hot reload on :5173, proxies `/api` to :8080): `cd frontend && npm ci && npm run dev`
3. Single image: `cd deploy/docker && cp .env.example .env && docker compose up --build`, then http://localhost:8080

Checks: `cd backend && ./gradlew test`; `cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build`; `npx @redocly/cli@2.78.0 lint api/openapi.yaml --config api/redocly.yaml`.

Layout:
- `api/openapi.yaml` the contract (server interfaces and TS types are generated)
- `backend/` Gradle project, package `com.javanix.rwx`
- `frontend/` Vite + React
- `docs/` ROADMAP.md, `openspec/` (specs, changes), `design/` (design system, prototypes)
- `deploy/docker/` Dockerfile and local compose (Helm for k3s goes to `deploy/helm/`)

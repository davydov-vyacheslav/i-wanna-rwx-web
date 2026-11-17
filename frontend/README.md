# RWX frontend

## Run against a backend on :8080

```sh
eval "$(fnm env --shell zsh)"; fnm use 24   # Node 24 (see .node-version)
npm ci
docker compose -f ../deploy/docker/docker-compose.yml up -d postgres
(cd ../backend && ./gradlew bootRun --args=--spring.profiles.active=dev)
npm run dev                                 # http://localhost:5173, /api and /actuator proxied to :8080
```

`src/api/schema.d.ts` is generated from `../api/openapi.yaml` by `npm run api:gen` (run automatically before dev, build, lint, typecheck, test).
Checks: `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run build`.

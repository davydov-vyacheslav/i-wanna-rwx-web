# Dev notes

Local setup and manual smoke checks that automated tests cannot do.

## Setup

1. GitHub OAuth App (https://github.com/settings/developers, "New OAuth App"): homepage `http://localhost:8080`, callback `http://localhost:8080/api/v1/auth/github/callback`, Device Flow off; generate a client secret (shown once).
2. `cp deploy/docker/.env.example deploy/docker/.env`, set `RWX_GITHUB_CLIENT_ID`, `RWX_GITHUB_CLIENT_SECRET` and `RWX_DATASOURCE_CONTACT` (an email or URL for the Open Library User-Agent; the app fails at startup without it). The file is git-ignored.
3. Start: `docker compose -f deploy/docker/docker-compose.yml up --build` (project `rwx`). Logs: `... logs -f app`.
4. Open the app on `http://localhost:8080`: the OAuth callback lands on the backend origin, so `npm run dev` (5173) cannot be used for login.

V001 is edited in place until the first deploy. After such an edit the local DB must be recreated, or Flyway rejects the checksum: `docker compose -f deploy/docker/docker-compose.yml down -v`, then `up --build`.

## Smoke checks

- `GET /actuator/health` returns 200 `{"status":"UP"}`; `/` shows the login page when signed out.
- Sign in with GitHub: you land on the Settings screen (the only signed-in screen until Phase 3) with your GitHub name (login if the name is empty), avatar and Sign out. A reload stays signed in (`SESSION` cookie HttpOnly, SameSite=Lax; readable `XSRF-TOKEN`). Logout returns to the login page. Signing in again gives the same account (`select count(*) from users` stays 1).
- Login failure is covered by `GithubLoginTests`; the log line is `Login failed: <class> (error code <code>)`.

DB access: `docker compose -f deploy/docker/docker-compose.yml exec postgres psql -U rwx -c "<sql>"`.

**Two sessions**: sign in in a private window too, log out there; the normal window must stay signed in (`select count(*) from spring_session` shows a row per live session).

**Export**: copy `SESSION` from devtools, then `curl -s -H "Cookie: SESSION=<value>" http://localhost:8080/api/v1/me/export | jq .` shows only `exportedAt`, your `user`, `settings` and `dataSources` (the chosen defaults, never a key), no session ids or tokens. `/api/v1/me` shows id, display name and avatar only.

**Account deletion** (destructive: removes the user and all its sessions): copy `SESSION` and `XSRF-TOKEN`, then `curl -i -X DELETE -H "Cookie: SESSION=<s>; XSRF-TOKEN=<x>" -H "X-XSRF-TOKEN: <x>" http://localhost:8080/api/v1/me` returns 204; every window then shows the login page and `users` is empty. Without the `X-XSRF-TOKEN` header it returns 403 and deletes nothing.

## Visual review of the Settings screen (Phase 2)

1. `deploy/docker/.env` needs `RWX_DATASOURCE_CONTACT` besides the two GitHub values (the app fails at startup without it).
2. `docker compose -f deploy/docker/docker-compose.yml up --build -d`, open `http://localhost:8080`, sign in with GitHub.
3. Walk through: Account (avatar or initials, Sign out), Sources (Open Library: no key; TMDb: key save/replace/remove, wrong key shows the per-source error), Language (en/ru/uk applied at once), Timezone (device zone offer, Keep UTC), Account data (export download, delete confirmation).
4. Check light and dark (system setting), a narrow window (about 375 px) and a long ru/uk label. The default-source radio is hidden while a type has one source; to see it, temporarily register a second source.
5. `npm run dev` (5173) serves only the signed-out login page: the OAuth callback lands on :8080.

## Postponed to the full-deployment / PWA phase

iPhone / installed PWA (OAuth redirect return, safe areas, dark mode, offline "Can't reach the server"), ru/uk locale check. Tracked in `docs/TODO.md`.

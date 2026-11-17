# Dev notes

Local setup and manual smoke checks that automated tests cannot do.

## Setup

1. GitHub OAuth App (https://github.com/settings/developers, "New OAuth App"): homepage `http://localhost:8080`, callback `http://localhost:8080/api/v1/auth/github/callback`, Device Flow off; generate a client secret (shown once).
2. `cp deploy/docker/.env.example deploy/docker/.env`, set `RWX_GITHUB_CLIENT_ID` and `RWX_GITHUB_CLIENT_SECRET`. The file is git-ignored.
3. Start: `docker compose -f deploy/docker/docker-compose.yml up --build` (project `rwx`). Logs: `... logs -f app`.
4. Open the app on `http://localhost:8080`: the OAuth callback lands on the backend origin, so `npm run dev` (5173) cannot be used for login.

V001 is edited in place until the first deploy. After such an edit the local DB must be recreated, or Flyway rejects the checksum: `docker compose -f deploy/docker/docker-compose.yml down -v`, then `up --build`.

## Smoke checks

- `GET /actuator/health` returns 200 `{"status":"UP"}`; `/` shows the login page when signed out.
- Sign in with GitHub: you land on `/` with your GitHub name (login if the name is empty), avatar and Logout. A reload stays signed in (`SESSION` cookie HttpOnly, SameSite=Lax; readable `XSRF-TOKEN`). Logout returns to the login page. Signing in again gives the same account (`select count(*) from users` stays 1).
- Login failure is covered by `GithubLoginTests`; the log line is `Login failed: <class> (error code <code>)`.

DB access: `docker compose -f deploy/docker/docker-compose.yml exec postgres psql -U rwx -c "<sql>"`.

**Two sessions**: sign in in a private window too, log out there; the normal window must stay signed in (`select count(*) from spring_session` shows a row per live session).

**Export**: copy `SESSION` from devtools, then `curl -s -H "Cookie: SESSION=<value>" http://localhost:8080/api/v1/me/export | jq .` shows only your `user`, `settings` and empty lists, no session ids or tokens. `/api/v1/me` shows id, display name, avatar, time zone.

**Account deletion** (destructive: removes the user and all its sessions): copy `SESSION` and `XSRF-TOKEN`, then `curl -i -X DELETE -H "Cookie: SESSION=<s>; XSRF-TOKEN=<x>" -H "X-XSRF-TOKEN: <x>" http://localhost:8080/api/v1/me` returns 204; every window then shows the login page and `users` is empty. Without the `X-XSRF-TOKEN` header it returns 403 and deletes nothing.

## Postponed to the full-deployment / PWA phase

iPhone / installed PWA (OAuth redirect return, safe areas, dark mode, offline "Can't reach the server"), ru/uk locale check. Tracked in `docs/TODO.md`.

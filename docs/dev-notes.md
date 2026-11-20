# Dev notes

Local setup and manual smoke checks that automated tests cannot do.

## Setup

1. GitHub OAuth App (https://github.com/settings/developers, "New OAuth App"): homepage `http://localhost:8080`, callback `http://localhost:8080/api/v1/auth/github/callback`, Device Flow off; generate a client secret (shown once).
2. `cp deploy/docker/.env.example deploy/docker/.env`, set `RWX_GITHUB_CLIENT_ID`, `RWX_GITHUB_CLIENT_SECRET` and `RWX_DATASOURCE_CONTACT` (an email or URL for the Open Library User-Agent; the app fails at startup without it). The file is git-ignored.
3. Start: `docker compose -f deploy/docker/docker-compose.yml up --build` (project `rwx`). Logs: `... logs -f app`.
4. Open the app on `http://localhost:8080`: the OAuth callback lands on the backend origin, so `npm run dev` (5173) cannot be used for login.

V001 is edited in place until the first deploy. After such an edit the local DB must be recreated, or Flyway rejects the checksum: `docker compose -f deploy/docker/docker-compose.yml down -v`, then `up --build`.

## Dev preview sources

With the `dev` profile only (the compose default), `datasource/internal/DevPreviewSources.java` adds made-up sources (books: Hardcover, Library of Congress, Google Books; movies: OMDb, Trakt, Kinopoisk) to Settings > Sources so the section can be tried with several rows. Their default and key state lives in memory per user and resets on restart; any non-blank key is accepted, nothing is stored or sent. The bean does not exist in any other profile.

## Dev dataset

After signing in once, fill the account with varied books, movies, subscriptions and licenses (all urgency states, lifetime, long and Cyrillic titles, drafts and source items):

`docker compose -f deploy/docker/docker-compose.yml exec -T postgres psql -U rwx -v ON_ERROR_STOP=1 -f - < deploy/docker/dev-seed.sql`

It targets the newest user who signed in with GitHub (`-v user_id=<uuid>` for another), is safe to re-run (it replaces its own fixed-id rows and refreshes the reminder dates relative to today) and leaves your other rows alone. Books and movies from Open Library and TMDb are real works (ids, links, covers, posters); the rest are drafts. A credential-less self-test user (`11111111-1111-1111-1111-111111111111`, seeded the same way) lives in the local DB for data checks; nobody can sign in as it. Plain SQL on purpose: there is no dev login or seeding code in the app.

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

## PWA: trying it locally (desktop Chrome or Edge)

The service worker is off in `npm run dev`; it exists only in a production build, so use the compose stack (the Spring jar serves the built frontend) at `http://localhost:8080` (`localhost` counts as a secure context).

1. `docker compose -f deploy/docker/docker-compose.yml up --build -d`, open `http://localhost:8080`, sign in with GitHub (the sign-in page is the shell as a decoration: dimmed sidebar, large icon, one line, the GitHub button).
2. DevTools > Application: Manifest (name RWX, three icons, no warnings), Service Workers (`sw.js` activated), Cache Storage (precache plus `covers-v1` once covers have loaded).
3. Install: the install icon in the address bar, or Settings > App > "Install app" (the row exists only while the browser offers the install and the app is not installed; it disappears once installed). The installed window must open standalone.
4. Offline: DevTools > Network > Offline, reload. The shell opens and shows "Can't reach the server"; images seen before still show, new ones show the book or movie placeholder. Navigation to `/api/...`, `/actuator/...` and `/oauth2/...` is never answered by the worker.
5. Update: change anything in the frontend, `docker compose ... up --build -d` again, resume or reload the open tab: the toast "A new version is available" appears (the check runs on focus and when the network returns, at most every 30 minutes; DevTools > Service Workers "Update" forces it); Reload applies it. "Update on reload" and "Clear site data" in DevTools reset the state.
6. Regenerate the icons (ImageMagick 7): `frontend/scripts/make-icons.sh "<path to AppIcon 1.png>"` (the artwork is in the iOS project, `Assets.xcassets/AppIcon.appiconset`); it writes the five PNGs in `frontend/public` and checks their corners.

## After the first deploy: iPhone checks

Owner checks on a real iPhone once there is an HTTPS deployment (details and reasoning: `docs/openspec/changes/archive/pwa-install/design.md` section 10; the leftovers are tracked in `docs/TODO.md`).

1. Add to Home Screen from Safari: the icon is the full-bleed artwork, no black corners, label "RWX"; the app launches standalone, no Safari chrome.
2. Sign-in inside the standalone app: GitHub OAuth opens and returns, and the user is signed in in the PWA. This is the riskiest check: iOS may hand the cross-origin navigation to an in-app browser whose cookies differ from the app's.
3. The session persists after killing and relaunching the app, and after a day.
4. Dark mode: the dark placeholder and the dark `theme-color`; safe-area gutters (status bar, home indicator); ru and uk.
5. Airplane mode, launch: the shell appears from the precache (no "Safari cannot open the page") and shows "Can't reach the server"; covers seen before still show.
6. Update: deploy a second build, resume the app: the toast appears within one resume (or after the 30-minute throttle), Reload applies it; ignoring it, a cold launch has the new version.
7. Settings in standalone: no App row; in Safari (not installed) the "Add to Home Screen" row opens the three steps, whose menu names must match the real iOS wording in en, ru and uk.
8. Add to Home Screen from Chrome or Edge on iOS (16.4+) works through the same steps.
9. Covers: Open Library and TMDb images load under the CSP (no blocked images in the Web Inspector console) and come from the cache on the second launch.
10. Storage eviction: after a week unused the app still launches.

Also from earlier phases: the media screens (safe area at the tab bar and the sticky search row, the add sheet with the keyboard, swipe-to-delete, nested sheets with VoiceOver), the reminders screens (date wheel, 320 px widths in ru and uk, dark contrast of the selected segment) and the account data export download (it may open a share sheet instead of saving).

# platform Specification

Cross-cutting runtime and build behaviour of the single deployable.

## Requirements

### Requirement: Health and reachability
Liveness and readiness SHALL be provided by Spring Boot Actuator: `GET /actuator/health`, `/actuator/health/liveness` and `/actuator/health/readiness`, without authentication. There SHALL be no application ping endpoint. A client MAY use `GET /actuator/health` as a reachability probe. Health responses SHALL NOT expose secrets or configuration values.

#### Scenario: Healthy
- **WHEN** the app and database are up
- **THEN** `GET /actuator/health` returns 200 with status `UP`

#### Scenario: Database down
- **WHEN** the database is unreachable
- **THEN** readiness reports `DOWN` with 503 while liveness stays `UP`

#### Scenario: No ping endpoint
- **WHEN** a client requests `/api/v1/ping`
- **THEN** the response is 404 `application/problem+json`

### Requirement: Contract-first interfaces
Server controller interfaces and TS client types SHALL be generated from `api/openapi.yaml` at build time; generated sources SHALL NOT be committed and SHALL NOT be edited.

#### Scenario: Contract drift
- **WHEN** a controller does not implement the generated interface method for an operation
- **THEN** the backend build fails to compile

### Requirement: Single-artifact serving
The Spring jar SHALL serve the built frontend from `/` and fall back to `index.html` for any GET path outside `/api` and `/actuator` that does not match a static file. Unknown `/api/**` paths SHALL return a 404 problem response, never `index.html`. A missing worker script SHALL NOT be masked: `/sw.js` is a real file of the build (see "Serving PWA files").

#### Scenario: Deep link
- **WHEN** a browser requests `/media/42`
- **THEN** `index.html` is returned with 200

#### Scenario: Unknown API path
- **WHEN** a client requests `/api/v1/nope`
- **THEN** the response is 404 `application/problem+json`

### Requirement: Web app manifest and icons
The app SHALL ship `/manifest.webmanifest` (linked from `index.html`) with `id`, `start_url` and `scope` `/`, `display` `standalone`, `name` and `short_name` `RWX`, `theme_color` and `background_color` equal to the light background token, and icons `icon-192.png` and `icon-512.png` (purpose any) and `icon-maskable-512.png` (purpose maskable, content inside the central 80% safe zone). `index.html` SHALL link a 180 px `apple-touch-icon`, a `favicon.png`, and `theme-color` metas for light and dark. All icons SHALL be full-bleed opaque squares produced from the iOS app artwork (a square crop inside its rounded tile, the black matte excluded) by the committed script `frontend/scripts/make-icons.sh`; `icon-192.png` is also the sign-in page logo; no separate dark or tinted variant is shipped (web apps on iOS take a single icon).

#### Scenario: Manifest is complete
- **WHEN** the manifest is parsed
- **THEN** every declared icon file exists with its declared size and the start URL and scope are `/`

#### Scenario: Icon has no matte
- **WHEN** an icon is rendered on a white background
- **THEN** it has no transparent or black rounded-corner border

### Requirement: Service worker scope
The app SHALL register one service worker, `/sw.js` with scope `/`, in production builds only. It SHALL precache the built shell (`index.html`, hashed assets, icons, placeholder images) and answer in-scope navigations with the precached `index.html`, except paths under `/api/`, `/actuator` and `/oauth2/`, which always go to the network. It SHALL cache at runtime only image requests to `covers.openlibrary.org` and `image.tmdb.org` (cache-first, opaque responses accepted, at most 150 entries, 30 days, purged on quota error). It SHALL NOT cache or answer any `/api`, `/actuator` or `/oauth2` request, any other cross-origin request or any user data. The worker SHALL NOT call `skipWaiting` on its own. It is the single worker that later carries Web Push handlers.

#### Scenario: Offline launch
- **WHEN** the installed app is launched without network
- **THEN** the shell loads from the precache and the "Can't reach the server" state is shown (no data is served)

#### Scenario: Sign-in is not intercepted
- **WHEN** the user taps Sign in (navigation to `/oauth2/authorization/github`)
- **THEN** the request reaches the server and is not answered with the cached shell

#### Scenario: Cover seen before
- **WHEN** a cover from `covers.openlibrary.org` was shown earlier and the network is gone
- **THEN** it is shown from the cover cache

#### Scenario: API is never cached
- **WHEN** the app requests `/api/v1/books` while offline
- **THEN** the request fails at the network and nothing is served from a service worker cache

### Requirement: Update to a new version
When a new service worker is installed and waiting, the app SHALL show a non-blocking "new version available" message with a Reload action; Reload activates the new worker and reloads the page once. Ignoring the message SHALL leave the running page untouched, and the new version applies on the next cold launch. The app SHALL ask the browser to check for a new worker when the page becomes visible again and when the network returns, at most once per 30 minutes. No message is shown on first install.

#### Scenario: New version deployed
- **WHEN** a new build is deployed and the user brings the app to the foreground
- **THEN** after the check the message appears and Reload shows the new version

#### Scenario: Message ignored
- **WHEN** the user ignores the message and later relaunches the app
- **THEN** the new version is running

### Requirement: Serving PWA files
The jar SHALL serve `/sw.js`, `/manifest.webmanifest` and the icons from the static root without authentication, with `Cache-Control: no-cache`, the manifest as `application/manifest+json`, and never answer them with the SPA fallback `index.html`. Hashed files under `/assets/` stay immutable for one year.

#### Scenario: Worker script
- **WHEN** an unauthenticated client requests `/sw.js`
- **THEN** the response is 200 with the worker script and `Cache-Control: no-cache`

#### Scenario: Manifest content type
- **WHEN** a client requests `/manifest.webmanifest`
- **THEN** the content type is `application/manifest+json`

### Requirement: Content security policy for images
Every response SHALL carry a `Content-Security-Policy` header whose `img-src` allows `'self'`, `data:`, `https://covers.openlibrary.org`, `https://archive.org` and `https://*.archive.org` (cover redirects: the first hop is the bare domain, which the wildcard does not match), `https://image.tmdb.org` and `https://avatars.githubusercontent.com`, and which sets `object-src 'none'`, `base-uri 'self'` and `frame-ancestors 'none'`. Script, style and connect directives are not set in this change.

#### Scenario: Header present
- **WHEN** any response (page, API, 404) is returned
- **THEN** it has the policy header with the image sources above

### Requirement: Schema management
Flyway SHALL apply migrations on startup, starting from the baseline `V001__initial_schema.sql`; `V001` MAY be edited in place until the first deploy (no `V002` before then); from the first deploy on, migrations SHALL be append-only (applied files are never edited); Hibernate SHALL only validate the schema, never generate it.

#### Scenario: Fresh database
- **WHEN** the app starts against an empty database
- **THEN** all migrations are applied in order and the app becomes ready

#### Scenario: Schema mismatch
- **WHEN** an entity does not match the migrated schema
- **THEN** startup fails on validation

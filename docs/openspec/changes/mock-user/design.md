# Design: mock-user

## 1. Published API (package `com.javanix.rwx.identity`, module "Identity")
- `record CurrentUser(UUID id, ZoneId timezone)`.
- `interface CurrentUserProvider { CurrentUser current(); }` - throws `NotAuthenticatedException` (maps to 401 problem) when there is no user. Media/reminders inject only this. They never see `users`, `User` entities or `rwx.auth.*`.
- Internals (not exported): `UserEntity`, `CredentialEntity`, `UserSettingsEntity` and their repositories, `MockCurrentUserProvider`, `MockUserInitializer`, `MockModeGuard`, `MeController`. A later `SecurityContextCurrentUserProvider` replaces the mock bean without touching callers.
- Resolution is per request on every call (no caching of the user in domain beans); mock impl reads the fixed id and loads timezone from DB (one PK lookup; cheap, and a PATCH /me (or /settings) timezone change is seen immediately).

## 2. Data (V001 is authoritative, no migration in this change)
V001 already holds everything needed, so this change adds no Flyway migration. `users` has only id and timestamps (`disabled_at` for soft-disable). Display name and avatar live in `credentials.data` (JSON keys `name`/`login`, `avatar_url`); timezone and locale live in `user_settings` (one row per user, `timezone` default `UTC`, optional `locale`, push flag). Nothing is added to `users`.
No mock row is seeded by a migration: seeding in SQL would put a fake account into every production database. `MockUserInitializer` (`ApplicationRunner`, only when mock mode is active) idempotently creates, in one transaction: the user with the fixed id `00000000-0000-0000-0000-000000000001`, a `dev` credential (external id `mock`, data with name "Mock user", no avatar) and the `user_settings` row with defaults. Each insert is a no-op if the row exists (`ON CONFLICT DO NOTHING`), so a restart or a half-created state heals itself.
Ownership: the `identity` module owns `users`, `credentials` and the timezone/locale part of `user_settings`. The settings capability (`/settings`) reaches the same values only through an identity published API, so the timezone-changed event is published from one place regardless of which endpoint was called. Flyway: if a later change needs a schema addition, it adds the next migration from V002 in actual merge order; there are no reserved numbers.

## 3. Mode selection and the safety guard
`rwx.auth.mode`: `mock` (default in `application.yaml` for now) | `github` (reserved; until implemented, startup fails with "not implemented"). Any other value fails startup.
`MockModeGuard` runs at context startup (before the initializer) and throws `IllegalStateException` with a clear message when mode=mock and any of:
1. profile `prod` (or `k8s`, `production`) is active, regardless of anything else (hard no, no override);
2. no profile in {`dev`, `test`} is active AND `rwx.auth.mock.allowed` is not `true` (env `RWX_AUTH_MOCK_ALLOWED`).
So: `./gradlew bootRun` with `dev`, tests, and Compose work. Compose sets `SPRING_PROFILES_ACTIVE=dev` (local only), which satisfies rule 2 by itself; `RWX_AUTH_MOCK_ALLOWED` is not set there. The override remains for a bare jar on a trusted machine; a Helm release or any bare `java -jar` fails fast unless someone sets the override on purpose. The Helm chart (Phase 7) must not set it; add a chart test then. When the real provider lands, the default flips to `github` and the guard stays.
Active mock mode logs one WARN banner at startup and `GET /me` returns `authMode: mock`, which the SPA shows as a badge so it is never mistaken for a real account.
Trade-off: default `mock` in `application.yaml` (owner wish "for now") means safety rests on the guard, not on the default. Rejected: guard by bind address (unreliable in containers).

## 4. Per-user isolation from day one (rules media-core must follow)
- Every user-owned table: `user_id uuid not null references users(id)`, and `user_id` is the first column of the PK/unique indexes.
- Repositories expose only `...AndUserId`/`ByUserId...` methods; no `findById`/`findAll`/`deleteById` on user-owned entities (enforced by an architecture test per module, see tasks).
- Cross-user access is 404, never 403.
- Test kit (test sources, shared): `TestCurrentUserProvider` (`@Primary` in tests, `as(userA)`), `TwoUsersFixture` creating users A and B through the identity API, helper `assertNotFoundFor(userB, request-on-A's-resource)`. Used by every module's isolation test.

## 5. Timezone
`user_settings.timezone` (JSON `timeZone`) is an IANA id, default `UTC`; `users` has no timezone column. `PATCH /api/v1/me {timezone}` validates against `ZoneId.getAvailableZoneIds()` (400 otherwise). The SPA sends `Intl.DateTimeFormat().resolvedOptions().timeZone` on app open only when it differs from the cached `/me` value. Reminders will recompute `notifyAt` on change via an event `UserTimezoneChanged(userId, old, new)` published by identity (declared now, no listeners yet, so Modulith direction is fixed: identity publishes, reminders listens).

## 6. OpenAPI (already in `api/openapi.yaml`; the contract wins)
The contract has tag `me`, `GET /api/v1/me` (`getMe`, 200 or 401 problem) and `PATCH /api/v1/me` (`updateMe`, 200, 400, 401), schemas `Me` and `UpdateMeRequest`, and `Problem` already carries `code` and `errors`. `Me` fields: `id`, `displayName`, `avatarUrl` (nullable), `authMode` (`mock|github`), `timeZone` (note the capital Z; same name in `/settings`), `locale` (nullable). `UpdateMeRequest` accepts `timeZone` and `locale` (enum `en|ru|uk`), at least one required (`minProperties: 1`).
Decisions on what the contract leaves open:
- `/me` and `/settings` are two views of the same `user_settings` values; one identity service serves both, so they cannot disagree. The SPA uses `/me` for bootstrap and `/settings` for the Settings screen.
- Validation: the schema rejects an empty body and a locale outside `en|ru|uk` (400 `validation`); the service rejects a zone outside `ZoneId.getAvailableZoneIds()` with 400 `invalid_timezone`. `/settings` uses the same locale enum (the client sends the language of the device locale, `ru-RU` becomes `ru`). Nothing changes on a 400.
- The contract declares a global `cookieAuth` scheme (apiKey in cookie `SESSION`); it is not enforced in mock mode (no login needed, stated in the contract description), and no Spring Security is added by this change.
- `POST /auth/logout` exists in the contract: in mock mode it is a no-op returning 204.

## 7. Client
- `useMe()` (TanStack Query, key `['me']`), cached in Dexie `meta`. Dexie database is opened per user: name `rwx-<userId>` after `/me` resolves (the current `rwx` DB is a skeleton artifact and is dropped; no second always-open DB is needed). Reason: with real accounts on a shared device, one global DB would leak user A's cache to user B; fixing it later would touch every data hook.
- All data hooks get the db through `useDb()`; nothing imports a global `db`.

## Resolved against the current sources
- Timezone/locale owner: `user_settings` (V001), exposed by both `/me` and `/settings` through one identity service.
- Display name/avatar: `dev` credential `data`; no columns added to `users`.
- No users migration (V001 has the table); `Problem.code/errors` and `/me` are already in the contract.
- Reachability: clients may probe Actuator `GET /actuator/health`; this change adds no extra client DB for it.

# identity Specification

Who the acting user is, how they authenticate, and how their data is isolated.

## Status
- Implementation order: mock mode first (change `mock-user`), real GitHub OAuth later (change `identity-github-oauth`, postponed by owner decision). Requirements below are tagged `[mock]`, `[github]` or `[future]`; only `[mock]` and the untagged ones are in scope now.
- Schema facts follow `V001__initial_schema.sql`: `users` holds only id and timestamps (plus `disabled_at`); display name, login and avatar live in `credentials.data`; timezone and locale live in `user_settings`. Contract facts follow `api/openapi.yaml` (`GET`/`PATCH /api/v1/me`, `/settings` and `POST /api/v1/auth/logout` exist; the GitHub redirect endpoints and dev-login are not in the contract yet).

## Requirements

### Requirement: Current user abstraction
Domain modules SHALL obtain the acting user only through the published `CurrentUserProvider` (user id, IANA timezone) and SHALL NOT read user or credential storage or authentication configuration. When there is no user, the provider SHALL signal not-authenticated, mapped to a 401 problem response.

#### Scenario: Provider swap
- **WHEN** the mock provider is replaced by the OAuth provider
- **THEN** no media or reminders code changes

#### Scenario: No user
- **WHEN** a request has no resolvable user
- **THEN** the response is 401 `application/problem+json`

### Requirement: Mock user mode [mock]
Until real authentication exists, the system SHALL run with `rwx.auth.mode=mock`, which resolves every request to one fixed user (id `00000000-0000-0000-0000-000000000001`) created on startup if absent; migrations SHALL NOT seed it. Any mode value other than `mock` or `github` SHALL fail startup, and `github` SHALL fail startup as not implemented until the OAuth change lands.

#### Scenario: First start
- **WHEN** the app starts in mock mode on an empty database
- **THEN** exactly one mock user exists and every request acts as that user

#### Scenario: Repeated start
- **WHEN** the app restarts in mock mode
- **THEN** no second mock user is created

### Requirement: Mock mode safety guard [mock]
Mock mode SHALL refuse to start under profile `prod`, `k8s` or `production`, with no override; otherwise it SHALL start only under profile `dev` or `test`, or when `rwx.auth.mock.allowed=true`. Active mock mode SHALL log a startup warning and the current-user endpoint SHALL report `authMode` so the client can show a visible badge. The Helm chart SHALL NOT set the override.

#### Scenario: Production profile
- **WHEN** mode is mock and profile `prod` is active, even with `allowed=true`
- **THEN** startup fails with a message naming `rwx.auth.mode`

#### Scenario: Bare jar
- **WHEN** the jar starts with no profile and no `RWX_AUTH_MOCK_ALLOWED`
- **THEN** startup fails

#### Scenario: Local compose
- **WHEN** Docker Compose starts the app, which sets `SPRING_PROFILES_ACTIVE=dev` (a profile in the allowed set, so the guard passes; `RWX_AUTH_MOCK_ALLOWED` is not set)
- **THEN** the app starts in mock mode

### Requirement: Current user endpoint
`GET /api/v1/me` SHALL return the user id, display name, avatar URL (nullable) and `authMode`. The endpoint SHALL be added to `api/openapi.yaml` before implementation.

#### Scenario: Mock mode
- **WHEN** the client calls `GET /api/v1/me` in mock mode
- **THEN** the response has the mock user id and `authMode` equal to `mock`

### Requirement: User timezone and locale
A user SHALL have an IANA timezone (default `UTC`) and an optional locale (`en`, `ru`, `uk` by device locale), stored in `user_settings` and changed via `PATCH /api/v1/settings` (`timeZone`, `locale`). A timezone not in the JDK zone list SHALL be rejected with 400 and leave the stored value unchanged. A change SHALL publish `UserTimezoneChanged(userId, old, new)`, which reminders consumes to recompute notification times. The client SHALL send its resolved device timezone on app open only when it differs from the cached value.

#### Scenario: Invalid zone
- **WHEN** the client sends timezone `Mars/Base`
- **THEN** the response is 400 and the stored zone is unchanged

#### Scenario: Zone change
- **WHEN** the user changes timezone
- **THEN** `UserTimezoneChanged` is published and identity does not call reminders directly

### Requirement: Per-user data isolation
Every user-owned table SHALL carry `user_id` and every query SHALL be scoped by it; repositories of user data SHALL expose only user-scoped finders. Accessing another user's record SHALL return 404, never 403. Every module SHALL have an integration test with two users (A and B) that exercises each endpoint with B against A's resource ids and expects 404 without data leakage.

Exception: `DELETE /api/v1/push-subscriptions/{id}` is idempotent and returns 204 for an unknown id and for another user's id alike, without deleting the foreign row. A push subscription id carries no user data and is not shown in any list, and a uniform 204 leaks nothing about existence. Every other endpoint returns 404.

#### Scenario: Cross-user read
- **WHEN** user B requests a record id owned by user A
- **THEN** the response is 404

#### Scenario: Cross-user write
- **WHEN** user B updates or deletes a record id owned by user A
- **THEN** the response is 404 and A's record is unchanged

### Requirement: Client cache isolation
The client SHALL keep local data in a database named per user id (`rwx-<userId>`), opened after the current user is known.

#### Scenario: Two users, one device
- **WHEN** user B signs in on a device used by user A
- **THEN** B sees none of A's cached records

### Requirement: Users and credentials
The system SHALL model a user separately from its credentials; a user SHALL be able to own multiple credentials of type `github`, `passkey` or `dev`; a credential SHALL be unique by (type, external id). Credential `data` SHALL hold identity metadata only (login, avatar, passkey public key and sign count) and is not encrypted. A user with `disabled_at` set SHALL NOT be able to log in.

#### Scenario: Second credential
- **WHEN** a logged-in user links another credential
- **THEN** it is attached to the same user and the user id does not change

#### Scenario: Credential taken
- **WHEN** a credential already belongs to another user
- **THEN** linking fails with 409

#### Scenario: No auto-linking
- **WHEN** a new credential has a profile matching an existing user
- **THEN** it is not linked automatically

### Requirement: GitHub OAuth login [github]
The system SHALL authenticate users with the GitHub OAuth authorization code flow (scope `read:user` only) with `state` and PKCE held in the pre-auth session, identifying the user by the immutable numeric GitHub id, never the login. The GitHub access token SHALL NOT be stored. The first successful login SHALL create the user and a `github` credential for any GitHub account: sign-up is open. An optional allow-list MAY be enabled by configuration for private deployments; it is off by default.

#### Scenario: First login
- **WHEN** an unknown GitHub id completes the flow
- **THEN** a user and a `github` credential are created and a session starts

#### Scenario: Not allow-listed (only when the optional allow-list is enabled)
- **WHEN** an unknown GitHub id outside the allow-list completes the flow
- **THEN** no user is created, no session starts and the user sees a not-invited message

#### Scenario: Bad state or PKCE
- **WHEN** the callback `state` or PKCE verifier does not match
- **THEN** the login is rejected with 400 and no session is created

#### Scenario: Renamed GitHub account
- **WHEN** a known GitHub id logs in with a new login name
- **THEN** the same user is used and the credential metadata is updated

### Requirement: Sessions and CSRF [github]
The system SHALL use server-side sessions (Spring Session JDBC) with an opaque id in an HttpOnly, SameSite=Lax cookie (Secure except on localhost), 30-day rolling idle timeout. Mutating requests SHALL require a CSRF token (double-submit, header `X-XSRF-TOKEN`); safe GET requests SHALL NOT. The API is same-origin, so CORS SHALL NOT be enabled.

#### Scenario: Missing CSRF token
- **WHEN** an authenticated POST has no valid CSRF token
- **THEN** the request is rejected with 403 and nothing changes

#### Scenario: Rolling session
- **WHEN** the user is active within 30 days of the last request
- **THEN** the session stays valid

### Requirement: Logout
`POST /api/v1/auth/logout` SHALL invalidate the session and return 204. In mock mode it SHALL be a no-op returning 204.

#### Scenario: Logout
- **WHEN** the user logs out
- **THEN** the session id no longer authenticates and the client returns to the sign-in screen

### Requirement: Dev login [github]
A dev login (`POST /auth/dev-login`, credential type `dev`) MAY exist for tests and local use only under profile `dev`, SHALL fail startup if enabled with a non-localhost base URL, and SHALL NOT exist (404) in any other profile.

#### Scenario: Production
- **WHEN** the app runs without the `dev` profile
- **THEN** `/auth/dev-login` does not exist (404)

### Requirement: Passkeys [future]
Passkeys SHALL be added as a second credential type on the existing credential model, with registration from Settings, without migrating users. Out of scope until phase 9.

#### Scenario: Add passkey later
- **WHEN** passkeys ship
- **THEN** a user can sign in with GitHub or a passkey and keeps the same user id

### Requirement: Account data export and deletion
A signed-in user SHALL be able to delete the account (`DELETE /api/v1/me`, from Settings with a confirmation); the user and all of the user's data SHALL be deleted (cascade), push subscriptions removed, and the session ended. Deletion is permanent. In mock mode there is no session: `DELETE /me` wipes all data of the mock user, keeps the fixed user row (or lazily recreates it on the next request) and returns 204. Before that, the user SHALL be able to export all own data (`GET /api/v1/me/export`, from Settings): a machine-readable JSON download of the profile, settings, books, movies, subscriptions and licenses (license keys included, since it is the owner's own data and the request is authenticated), live records only; it never includes the TMDb key or session data. The export is a data-portability duty of open sign-up, not a media feature.

#### Scenario: Export
- **WHEN** the user requests the export
- **THEN** the response is 200 with a JSON file containing only that user's live records, and another user's data is never included

#### Scenario: Delete account
- **WHEN** the user confirms account deletion
- **THEN** the response is 204, every row of the user is gone, and later requests with the old session are 401 (mock mode: 204, all data gone, the next request acts as the same fixed user with empty data)

## Open questions
- Passkeys and account recovery are on hold (parked, phase 9); the owner is still deciding.

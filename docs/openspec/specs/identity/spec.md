# identity Specification

Who the acting user is, how they authenticate, and how their data is isolated.

## Status
- Delivered by change `identity-github-oauth` (archived). There is no mock user, no dev login and no authentication bypass anywhere, including local development; local dev uses a real GitHub OAuth App. Tests authenticate through a test-only helper under `src/test` (see "Test authentication").
- Schema facts follow `V001__initial_schema.sql`: `users` holds only id and timestamps (plus `disabled_at`); display name, login and avatar live in `credentials.data`; timezone and locale live in `user_settings`. Contract facts follow `api/openapi.yaml` (`/auth/github/callback`; the login starts at Spring's `/oauth2/authorization/github`, outside the contract;, `/auth/logout`, `GET`/`PATCH`/`DELETE /me`, `GET /me/export`, `/settings`).

## Requirements

### Requirement: Current user abstraction
Domain modules SHALL obtain the acting user only through the published `CurrentUserProvider` (user id), resolved from the security context on every call, and SHALL NOT read user or credential storage or authentication configuration. A user that no longer exists or is disabled SHALL be treated as not authenticated. When there is no user, the provider SHALL signal not-authenticated, mapped to a 401 problem response.

### Requirement: Current user endpoint
`GET /api/v1/me` SHALL return the user id, display name (GitHub name, falling back to the login) and avatar URL (nullable). It SHALL carry no settings.

### Requirement: Per-user data isolation
Every user-owned table SHALL carry `user_id` and every query SHALL be scoped by it; repositories of user data SHALL expose only user-scoped finders. Accessing another user's record SHALL return 404, never 403. Every module SHALL have an integration test with two users (A and B) that exercises each endpoint with B against A's resource ids and expects 404 without data leakage.

Every endpoint returns 404 for another user's resource id. (The push phase may add a documented idempotent exception for deleting a push subscription, see `docs/openspec/changes/push-notifications/`.)

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
The system SHALL model a user separately from its credentials; a user SHALL be able to own multiple credentials, currently only of type `github` (the schema CHECK allows nothing else); a credential SHALL be unique by (type, external id). Credential `data` SHALL hold identity metadata only (login, avatar) and is not encrypted. A user with `disabled_at` set SHALL NOT be able to log in, and existing sessions of that user SHALL stop authenticating (401).

#### Scenario: Second credential
- **WHEN** a logged-in user links another credential
- **THEN** it is attached to the same user and the user id does not change

#### Scenario: Credential taken
- **WHEN** a credential already belongs to another user
- **THEN** linking fails with 409

#### Scenario: No auto-linking
- **WHEN** a new credential has a profile matching an existing user
- **THEN** it is not linked automatically

### Requirement: GitHub OAuth login
The system SHALL authenticate users with the GitHub OAuth authorization code flow (scope `read:user` only) with `state` held in the pre-auth session (confidential client; PKCE is on by Spring's default but not required), identifying the user by the immutable numeric GitHub id, never the login. The GitHub access token SHALL NOT be stored. The first successful login SHALL create the user and a `github` credential for any GitHub account: sign-up is open, there is no allow-list or invitation. After a successful login the browser SHALL be redirected to `/`.

#### Scenario: First login
- **WHEN** an unknown GitHub id completes the flow
- **THEN** a user and a `github` credential are created and a session starts

#### Scenario: Disabled account
- **WHEN** a known GitHub id whose user is disabled completes the flow
- **THEN** no session starts and the browser is redirected to the generic `/login?error`

#### Scenario: Any other login failure
- **WHEN** the user cancels at GitHub, the callback `state` is missing, wrong or replayed, or GitHub fails
- **THEN** no session is created and the browser is redirected to `/login?error`; there are no distinct reasons and no 400

#### Scenario: Forged callback while signed in
- **WHEN** a failing callback arrives with a signed-in session cookie
- **THEN** that session stays valid

#### Scenario: Renamed GitHub account
- **WHEN** a known GitHub id logs in with a new login name
- **THEN** the same user is used and the credential metadata is updated

### Requirement: Sessions and CSRF
The system SHALL use server-side sessions (Spring Session JDBC) with an opaque id in an HttpOnly, SameSite=Lax cookie (Secure except on localhost), 30-day rolling idle timeout. Mutating requests SHALL require a CSRF token (double-submit, header `X-XSRF-TOKEN`); safe GET requests SHALL NOT. The API is same-origin, so CORS SHALL NOT be enabled.

#### Scenario: Missing CSRF token
- **WHEN** an authenticated POST has no valid CSRF token
- **THEN** the request is rejected with 403 and nothing changes

#### Scenario: Rolling session
- **WHEN** the user is active within 30 days of the last request
- **THEN** the session stays valid

### Requirement: Logout
`POST /api/v1/auth/logout` SHALL invalidate the session and return 204. It SHALL expire the `SESSION` cookie and be idempotent: without a valid session it also returns 204.

#### Scenario: Logout
- **WHEN** the user logs out
- **THEN** the session id no longer authenticates and the client returns to the sign-in screen

### Requirement: Login page and home
The SPA SHALL show, to a signed-out visitor, a login page with a single "Sign in with GitHub" button (strings in en, ru, uk by device locale) that navigates the browser to `/oauth2/authorization/github`; a `/login?error` return SHALL show one generic failure message. After login a temporary home page SHALL show the user's GitHub login, the avatar when present, and a Logout button; the Books list of `media-core` replaces this page.

#### Scenario: Signed-out visit
- **WHEN** `GET /me` returns 401
- **THEN** only the login page is shown, with no other navigation

#### Scenario: Signed-in visit
- **WHEN** `GET /me` returns the user
- **THEN** the home page shows the GitHub login and a Logout button, and the per-user local database `rwx-<userId>` is opened

#### Scenario: Logout
- **WHEN** the user taps Logout
- **THEN** `POST /auth/logout` is called, the per-user database handle is closed, cached queries are cleared and the login page is shown

### Requirement: Test authentication
Automated tests SHALL authenticate without any production bypass: a helper under `src/test` creates a user, a `github` credential, a `user_settings` row and a real session (or security context) directly through the identity module's test fixtures. No production class, profile, property or endpoint SHALL exist for logging in without GitHub.

#### Scenario: No bypass
- **WHEN** the production jar runs with any profile
- **THEN** the only way to obtain a session is the GitHub callback

### Requirement: Account data export and deletion
A signed-in user SHALL be able to delete the account (`DELETE /api/v1/me`, from Settings with a confirmation); the user and all of the user's data SHALL be deleted (cascade) and the session ended. Deletion is permanent. Before that, the user SHALL be able to export all own data (`GET /api/v1/me/export`, from Settings): a machine-readable JSON download of the profile, settings and chosen default data sources; media items and reminders join the export in their phases (license keys included then, since it is the owner's own data and the request is authenticated); it never includes a data source API key or session data. The export is a data-portability duty of open sign-up, not a media feature.

#### Scenario: Export
- **WHEN** the user requests the export
- **THEN** the response is 200 with a JSON file containing only that user's live records, and another user's data is never included

#### Scenario: Delete account
- **WHEN** the user confirms account deletion
- **THEN** the response is 204, every row of the user is gone, and later requests with the old session are 401

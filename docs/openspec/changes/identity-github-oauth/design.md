# Design: identity-github-oauth

## Data model
Schema is V001; this change adds only the Spring Session JDBC tables (first migration number free at merge time, from V002).
- `users`: id, timestamps, `disabled_at` only. No email (GitHub email may be private). Display name and avatar live in `credentials.data` (GitHub login, name, avatar URL), refreshed on every login. Timezone and locale live in `user_settings`, created together with the user (default `UTC`).
- `credentials`: many per user, type `github|passkey|dev` (CHECK in V001), unique (type, external_id), `last_used_at` updated on login. GitHub: `external_id` is the numeric GitHub user id (never the login). Passkey later needs no identity migration.
- `sessions`: Spring Session JDBC (`spring_session*` tables), opaque id in an `HttpOnly; Secure (not on localhost); SameSite=Lax` cookie. Idle 30 d, rolling.
- No encryption and no secrets table for now: the GitHub access token is not stored and the client secret comes from the environment.

## Flow
1. `GET /api/v1/auth/github/start` (path to be fixed in the contract) -> redirect to GitHub with `state` + PKCE stored in the pre-auth session. Scope: `read:user` only.
2. Callback validates `state`, exchanges the code server-side, reads GitHub user id/login/avatar.
3. Lookup credential (`github`, id). Found -> login and update its metadata. Not found -> create user, credential and settings row (sign-up is open; the optional allow-list by GitHub id via config is off by default). A user with `disabled_at` set cannot log in.
4. Session created; browser redirected to the SPA. GitHub access token is NOT stored (not needed after identity lookup).
5. Linking an extra credential to a logged-in user = same flow with `link=true` bound to the session user (needed once passkeys exist). Never auto-link by matching profile data.

## Isolation
- Every aggregate table has `user_id not null`; repositories expose only `findByIdAndUserId` style methods; no unscoped finders on user data. Test: a two-user integration suite per module hits every endpoint with user B's token against user A's ids and expects 404.
- Modulith: `identity` publishes `CurrentUser` (id, timezone) via an API interface; other modules never read `users`/`credentials`/`user_settings`. `SecurityContextCurrentUserProvider` replaces `MockCurrentUserProvider`; `/me`, `UserTimezoneChanged` and the `dev` credential already exist from `mock-user`.

## Dev login
`POST /auth/dev-login {name}` (not in the contract yet; must stay out of the production contract or be tagged dev-only) exists only with profile `dev` (bean conditional on profile, plus startup guard failing if enabled with a non-localhost base URL). Creates/gets a user with credential type `dev`.

## CSRF / API
Cookie session + CSRF token for mutating requests (double-submit header `X-XSRF-TOKEN`); API is same-origin (SPA served by the jar) so no CORS.

## Trade-offs
- Opaque DB-backed sessions over JWT: revocable, simple, no refresh logic; costs a DB hit (fine at this scale).
- Sign-up is open; an optional allow-list (off by default) stays available by configuration. Account deletion (`DELETE /me`) and account data export (`GET /me/export`) are in scope.
- The contract security scheme is `cookieAuth` (apiKey in cookie `SESSION`; the old `oauth2` implicit scheme is gone). Check the cookie name against the Spring Session config when this change starts.

# Tasks: identity-github-oauth
Postponed; starts after `mock-user` is merged. Schema is V001; the only migration is the Spring Session tables.
- [ ] 1. (architect) Contract: add `/auth/github/start` and `/auth/github/callback` (redirects, problem responses), optional dev-only `/auth/dev-login`, document the CSRF header (the global `cookieAuth` scheme replacing the old `oauth2` one is already in the contract). Verify: `npx @redocly/cli@2.78.0 lint api/openapi.yaml` exits 0.
- [ ] 2. Flyway: Spring Session JDBC tables only (next free number from V002). Verify: context loads with Hibernate `validate`; a session can be saved and read.
- [ ] 3. Real `CurrentUserProvider` (`SecurityContextCurrentUserProvider`) replacing the mock bean when mode=github; flip the default mode to `github`; guard stays. Verify: `ModularityTests` and the mock-user isolation suite pass unchanged.
- [ ] 4. GitHub OAuth client config (client id/secret via env), start/callback with state + PKCE in the pre-auth session. Verify: tests with a stubbed GitHub: bad state and bad PKCE return 400 with no session.
- [ ] 5. User/credential creation on first login (user + `github` credential + default `user_settings`), credential metadata refresh, `last_used_at`, `disabled_at` check, optional allow-list config (off by default). Verify: tests for open first login, with the allow-list enabled a not-allowed id (no user created), renamed GitHub login keeps the same user, disabled user rejected.
- [ ] 6. Session cookie settings + CSRF double-submit; real `logout` invalidating the session. Verify: missing token -> 403; cookie flags asserted; logout invalidates the session id.
- [ ] 7. Dev-login under profile `dev` (credential type `dev`) + startup guard. Verify: 404 without the profile; startup fails with a non-localhost base URL.
- [ ] 8. SPA login screen, `/me` bootstrap (401 -> sign-in), CSRF header in the generated client. Verify: Testing Library tests for 401 redirect and header presence.
- [ ] 9. (code-reviewer) Review: OAuth state/PKCE, cookie flags, allow-list, no token stored, isolation suite green.

# Change: mock-user

## Why
Real authentication (`identity-github-oauth`) is postponed by owner decision, but media (and later reminders) need a user id on every row and every query from day one. A mock user lets Phase 3 proceed while keeping the later swap to GitHub OAuth invisible to domain code.

## What changes
- Minimal `identity` module: identity module over the existing V001 tables (`users`, `credentials`, `user_settings`; no new migration), published `CurrentUser` / `CurrentUserProvider` API, one auto-created mock user.
- Provider selected by `rwx.auth.mode` (`mock` is the default for now); a startup guard makes mock mode impossible to run in a production profile or an unacknowledged deployment.
- `GET/PATCH /api/v1/me` (display name, avatar, timezone, locale; backed by `credentials.data` and `user_settings`), compatible with the later OAuth change.
- Isolation test kit (two users A/B) and per-user Dexie database naming on the client.

## Impact
New capability `identity` (delta only). Affects: every later module (they depend only on `CurrentUserProvider`). `identity-github-oauth` later adds credentials, sessions and a second provider; its schema task shrinks to Spring Session tables only, because `users` and `credentials` are in V001 and the mock user already uses a `dev` credential.

## Non-goals
Login UI, sessions, CSRF, real credential flows, allow-list, account deletion. No Spring Security dependency yet.

Spec deltas were folded into `specs/identity`.

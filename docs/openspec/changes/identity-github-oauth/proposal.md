# Change: identity-github-oauth

## Why
RWX is multi-user and needs authentication and strict per-user data isolation. Decision (roadmap): GitHub OAuth only for now; passkeys later; no Apple sign-in.

## What changes
- Extends the `identity` module created by `mock-user`: real credential flows over V001 `users`/`credentials`, plus `sessions` (Spring Session JDBC).
- GitHub OAuth login (authorization code + PKCE + `state`), cookie session.
- `dev` Spring profile with a dev-login endpoint for tests and local use only.
- Per-user isolation rule for every other module.

## Impact
New capability `identity-github-oauth`. Domain modules are unaffected (they use `CurrentUserProvider`). Migration: Spring Session tables only. OpenAPI: `/me` and `/auth/logout` already exist; this change adds the GitHub start/callback endpoints, optional dev-login and the session security scheme. Postponed; `mock-user` goes first.

## Non-goals
Passkeys, account recovery, email/password, Apple sign-in, account deletion (open item).

Spec deltas were folded into `specs/identity`.

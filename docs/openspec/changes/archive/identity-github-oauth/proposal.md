# Change: identity-github-oauth

## Why
RWX is multi-user and needs authentication and strict per-user isolation before any domain data exists. Owner decision (2026-11-17): GitHub OAuth only, and no mock user at all, not even for local development (risk of polluting real data). This change is therefore the first one in the order: identity first, then `media-core`, `media-search`.

## What changes
- Backend module `identity` over V001 `users`/`credentials`/`user_settings`: GitHub OAuth login (authorization code, `state`), first login creates the user (open sign-up), Spring Session JDBC cookie `SESSION`, CSRF double-submit, logout.
- Published `CurrentUser` / `CurrentUserProvider` (resolved from the security context) that every later module uses.
- `GET`/`PATCH /me`, `DELETE /me`, `GET /me/export`.
- Per-user isolation test kit; tests authenticate through a test-only helper under `src/test`, never through a production bypass.
- Frontend: GitHub-only login page, `/me` bootstrap (401 shows login), per-user Dexie database `rwx-<userId>`, a temporary home page (GitHub login, avatar, Logout) replaced by the Books list in `media-core`.
- Local dev uses a real GitHub OAuth App: callback `http://localhost:8080/api/v1/auth/github/callback`, env `RWX_GITHUB_CLIENT_ID` / `RWX_GITHUB_CLIENT_SECRET`, documented in README and `deploy/docker/.env.example`.

## Impact
Capability `identity` (spec already updated). Migration: none; the Spring Session JDBC tables are already in V001 (edited in place before first deploy). Contract: `/auth/github/callback` (login starts at Spring's `/oauth2/authorization/github`) and the CSRF/cookie documentation are already in `api/openapi.yaml` (`authMode` removed from `Me`). V001 `credentials.type` allows `github` only. Every other module depends only on `CurrentUserProvider`.

## Non-goals
Mock or dev login of any kind, account recovery, email/password, Apple sign-in, Settings screen UI (the `/me` endpoints are API only here), account linking UI, GitHub access token storage.

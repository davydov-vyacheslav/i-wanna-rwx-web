# Change: media-search

## Why
Items are added from Open Library (books) and TMDb (movies/TV). Browsers must not call providers with the user's key, so the backend proxies both; the per-user TMDb key is stored server-side and never leaves it.

## What changes
- Module `search`: Open Library and TMDb clients behind `/search/books`, `/search/books/{sourceId}`, `/search/movies`, `/search/movies/{type}/{sourceId}` and `/search/sources`; per-user rate limit, timeouts, error mapping, SSRF-safe id validation.
- TMDb key management through the existing `/external-data-sources` endpoints (`apiKey` write-only, validated against TMDb before saving), stored in V001 `external_data_source_configuration`.
- Frontend: add sheet with provider search, in-library marks, add-from-result flow, TV refresh action, Settings sources screen.

## Impact
Capabilities `search`, `settings` (deltas). No migration: V001 already has the table. New env: `RWX_SEARCH_CONTACT`. Depends on `identity-github-oauth`; the frontend add flow depends on `media-core` F2 and F7. The create call and the TV refresh write path are in the contract.

## Non-goals
Encryption of the key at rest (deferred by the owner: the key is stored as is in `api_key`, `api_key_version` stays null; add AES-GCM later), `crypto` module and `user_secrets`, server-created library items from search (the client composes search + details + create), result caching across users, TMDb locale (Phase 8), export.

Spec deltas for `search` and `settings` were folded into `docs/openspec/specs/search/spec.md` and `docs/openspec/specs/settings/spec.md`; `specs/` was removed from this change.

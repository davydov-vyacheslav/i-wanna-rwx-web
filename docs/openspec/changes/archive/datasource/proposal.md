# Change: datasource (Phase 2)

Formerly the first half of the combined `media-search` change. On the Phase 2 re-plan (owner decision) the combined change was split: this change is the data-source machinery and its Settings section (roadmap phase 2); the search UI/flow, the search/details endpoints and the add flow are `docs/openspec/changes/media-search/` (phase 3). Revision history (1 to 4) lives in `design.md`.

## Why
Settings is incomplete without the data sources: a user chooses the default source of each resource type and saves an API key for a source that needs one (TMDb). Keys stay server-side and are never returned. The provider machinery (sources, URL recognition, resolvers, limits, error mapping) is already built and is what the next phase consumes.

## What changes
- Module `datasource` (package `com.javanix.rwx.datasource`): pluggable data sources per type behind an internal SPI (`BookSource`, `MovieSource`: id, label, requires-key, availability, URL recognition, search, resolve, key validation) with config-ordered registries (books = Open Library, movies and TV = TMDb); the published resolver API (`MediaResolver<R, I>`: `identify(sourceUrl)` and `resolve`, plus the qualified draft resolvers); per-user rate limit, timeouts, error mapping, SSRF-safe URL recognition.
- User data sources: `GET /data-sources` (per-type lists with `isDefault`, `isEffective`, `available`, `tokenSaved`, `requiresKey`), `PUT /data-sources/{resourceType}/{source}/default`, `PUT|DELETE /data-sources/{resourceType}/{source}/key`. Storage: V001 `user_default_sources` (primary key `(user_id, resource_type)`: one stored default per user and type, created at sign-up from `UserCreatedEvent`, see `changes/datasource-defaults`) and `user_source_keys` (primary key `(user_id, source)`: one row per saved key); no key status. API key stored as is (encryption deferred, `docs/TODO.md`), write-only, never returned or logged.
- Source-agnostic error codes `source_key_missing` (409), `source_key_invalid` (409), `source_key_rejected` (422); the source is named in `Problem.source`. In Phase 2 only the key operations are reachable over HTTP.
- Account export contributes the chosen defaults (`AccountExport.dataSources`, never a key); account deletion removes the rows.
- Settings "Sources" section filling the empty `SourcesSlot` of the `settings-screen` screen (DS-F4): lists, state, key form, default control when a type has two or more registered sources.
- Cleanup folded in earlier: `datasource-defaults` (default rows at sign-up) and `datasource-simplification` (library audit, draft resolvers).

## Contract note
`api/openapi.yaml` holds only the Phase 0-2 paths (`/data-sources*`, `/settings`, `/me*`, auth); `/search/*`, `/books`, `/movies` and `/sync/*` were removed from the contract and return with their phases (see the Phase 2 review list in `docs/ROADMAP.md`).

## Impact
Capabilities `datasource` (the current `search` spec is renamed when this change is folded in), `settings` (Sources delta). V001 was edited in place (`user_default_sources`, `user_source_keys`; nothing deployed). New env name `RWX_DATASOURCE_CONTACT`, properties `rwx.datasource.*`. Modulith: `datasource` depends on `identity`, `settings` (TMDb language), `common`, `api`; never on `media`.

## Non-goals
Encryption of the key at rest (deferred by the owner), `crypto` module and `user_secrets`, result caching across users, a multi-replica rate limiter (DS-B16 parked), anything about search UI, search endpoints, details endpoints, create or media items (Phase 3).

# Change: media-search (Phase 3)

Second half of the former combined `media-search` change, split off on the Phase 2 re-plan (owner decision). The data-source machinery (module `datasource`, `/data-sources`, keys, defaults, resolvers, limits, error mapping) is archived in `docs/openspec/changes/archive/datasource/` and in the tree. Order in Phase 3: `media-core`, then `media-search`.

## Why
Items are added from Open Library (books) and TMDb (movies/TV). Browsers must not call providers with the user's key, so the backend proxies search and details, and the add flow is a minimal `{id, sourceUrl}` that the server resolves.

## What changes
- Backend (`datasource` module): `GET /search/books`, `/search/movies` (keyword search of the effective or the chosen source, entries with a server-generated canonical `sourceUrl`, always ending with one `draft` entry) and `GET /search/books/details`, `/search/movies/details` (preview by `sourceUrl`), with the per-user search and details buckets (the SEARCH limiter kind exists but is not yet acquired anywhere) (MS-B1, MS-B2). Backend (`media`): provider create on `POST /books`, `POST /movies` with `{id, sourceUrl}` only: identify, duplicate pre-check, resolve outside any transaction, short locked insert (MS-B3, MS-B4).
- Add flow decisions (owner, revisions 3 and 3.1): the server recognizes the source from the URL (a pasted provider URL works through the API; the UI has no paste affordance), canonicalizes, resolves via the provider API on its own base URL (never fetches the client URL), stores the canonical `externalLink`; unrecognized URL = 400 `validation` on `sourceUrl`; a failed resolve creates nothing; the per-user write lock is not held across the provider call; the draft entry is hidden when the library already has that title (any title in the list, iOS rule); book hits carry an optional ISBN for the duplicate mark.
- Frontend: provider search in the media-core add sheet (source selector only when a type has more than one available source, in-library highlight, tap-to-add, optional preview), TV refresh, `source_key_*` error kinds (MS-F1 to MS-F6).

## Impact
Capabilities `datasource` (search part), `media` (delta), `offline-sync` (reason names, `design.md` section 13). Depends on `media-core` (tasks B3-B6 for the create base, F1/F2/F7 for the add sheet shell and helpers) and on the Phase 2 `datasource` module. Modulith: `media` depends on `datasource` through the published API only (`MediaResolver`, refs, items, `CatalogException`); search and details controllers are internal to `datasource`. Contract: restores the search/details paths and schemas (see tasks MS-B1/B2). No V001 change.

## Non-goals
TMDb locale beyond the user's stored locale, result caching across users, a UI to paste a raw link, encryption of keys, offline behaviour (Phase 5, `offline-sync`).

Spec deltas: `specs/datasource/spec.md` and `specs/media/spec.md`; the sync consequences are in `design.md` section 13 and are picked up by `offline-sync` (Phase 5).

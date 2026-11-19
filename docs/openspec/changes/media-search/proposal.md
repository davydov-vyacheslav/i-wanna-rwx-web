# Change: media-search (Phase 3)

Second half of the former combined `media-search` change, split off on the Phase 2 re-plan (owner decision). The data-source machinery (module `datasource`, `/data-sources`, keys, defaults, resolvers, limits, error mapping) is `docs/openspec/changes/archive/datasource/` and is done before this change. Order in Phase 3: `media-core`, then `media-search`.

## Why
Items are added from Open Library (books) and TMDb (movies/TV). Browsers must not call providers with the user's key, so the backend proxies search and details, and the add flow is a minimal `{id, sourceUrl}` that the server resolves.

## What changes
- Backend: `GET /search/books`, `/search/movies` (keyword search of the effective or the chosen source, entries with a server-generated canonical `sourceUrl`, always ending with one `draft` entry) and `GET /search/books/details`, `/search/movies/details` (preview by `sourceUrl`), per-user search and details buckets (DS-B9); provider create in `media` (`POST /books`, `POST /movies` with `{id, sourceUrl}` only: identify, duplicate pre-check, resolve outside any transaction, short locked insert) (DS-B7, DS-B8).
- Add flow decisions (owner, revisions 3 and 3.1): the server recognizes the source from the URL (a pasted provider URL works through the API; the UI has no paste affordance), canonicalizes, resolves via the provider API on its own base URL (never fetches the client URL), stores the canonical `externalLink`; unrecognized URL = 422 `unsupported_source`; a failed resolve creates nothing; the per-user write lock is not held across the provider call; the draft entry is hidden when the library already has that title; book hits carry an optional ISBN for the duplicate mark.
- Frontend: add sheet with a source selector shown only when a type has more than one available source, entry list with in-library highlight, tap-to-add, optional preview, TV refresh action, error kinds generalized to `source_key_*` (DS-F1b to DS-F8).

## Impact
Capabilities `datasource` (search part), `media` (delta), `offline-sync` (reason names, `design.md` section 13). Depends on `media-core` (including its B12-B14 rework and F10) and on Phase 2 `datasource`. Modulith: `media` depends on `datasource` through the published API only. No V001 change (`books`/`movies` come with `media-core`).

## Non-goals
TMDb locale beyond the user's stored locale, result caching across users, a UI to paste a raw link, encryption of keys (Phase 2 non-goal), offline behaviour (Phase 5, `offline-sync`).

Spec deltas: `specs/datasource/spec.md` and `specs/media/spec.md`; the sync consequences are in `design.md` section 13 and are picked up by `offline-sync` (Phase 5).

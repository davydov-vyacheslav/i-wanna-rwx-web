# Change: media-core

## Why
Phase 3 (first change of the phase; `media-search` follows; Phase 2 settings and data sources are done before it): personal lists of books and movies/TV (the heart of the app). It is built on what V001 already provides for `offline-sync` (`version`, tombstones, `change_seq`, client UUIDs) so no later API break is needed.

## What changes
- Backend module `media`: books and movies under `/api/v1/books` and `/api/v1/movies` as in `api/openapi.yaml`: list, `GET /{id}`, `POST` (create with a client UUID), `PATCH /{id}` (status, favorite), soft `DELETE`; drafts, duplicate detection with server enforcement, per-row `version`/`updatedAt`/tombstone/`change_seq`. Offline writes arrive later through `/sync/push`, which reuses the same service.
- Tiny module `sync` publishing a per-user write lock (needed so `change_seq` commits in order per user); `offline-sync` extends the module.
- Filters, sort, list search and "shown of total" counts are computed client-side over the full per-user list fetched from the API (TanStack Query). The client is online-first in this change: no Dexie cache, no outbox (both move to the Offline/PWA phase, `offline-sync`).
- Frontend: books and movies lists, cards, filter sheet, sort menu, search-in-list, counts, favorite/seen toggles, delete (plain, no Undo-through-outbox), description sheet, cover link, add-draft sheet (provider search plugs in via `media-search`); data access behind a thin `repository.ts` seam so the Offline/PWA phase can add Dexie and the outbox without touching components.

## Impact
Capability `media` (filters included). Schema is V001; V001 gets the `books`/`movies` tables back with the composite key `(user_id, id)` and the uniqueness indexes (removed in the Phase 2 cleanup, restored from `refs/shelf/pre-cleanup`), so this change adds no migration. The contract needs amendments before the write tasks can start (design section 9). Depends on `identity-github-oauth` (`CurrentUserProvider`, test kit, login, per-user Dexie naming). Writes are plain online API calls; `offline-sync` (Offline/PWA phase, roadmap phase 5) later replaces the repository body only.

## Non-goals
Search proxy (`media-search`, Phase 3) and the TMDb key and data sources (`datasource`, Phase 2, already done), Dexie cache, outbox, sync engine, offline banners, pending-sync dots, offline drafts, Undo through the outbox, `/sync/*` and `mutationId` handling (all `offline-sync`), user ratings, draft promotion, pagination.

The spec deltas were folded into `docs/openspec/specs/media`.

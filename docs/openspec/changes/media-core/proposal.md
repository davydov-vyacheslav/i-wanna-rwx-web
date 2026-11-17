# Change: media-core

## Why
Phase 3: personal lists of books and movies/TV (the heart of the app). It is built on what V001 already provides for `offline-sync` (`version`, tombstones, `change_seq`, client UUIDs) so no later API break is needed.

## What changes
- Backend module `media`: books and movies under `/api/v1/books` and `/api/v1/movies` as in `api/openapi.yaml`: list, `GET /{id}`, `POST` (create with a client UUID), `PATCH /{id}` (status, favorite), soft `DELETE`; drafts, duplicate detection with server enforcement, per-row `version`/`updatedAt`/tombstone/`change_seq`. Offline writes arrive later through `/sync/push`, which reuses the same service.
- Tiny module `sync` publishing a per-user write lock (needed so `change_seq` commits in order per user); `offline-sync` extends the module.
- Filters, sort, list search and "shown of total" counts are computed client-side from the full per-user list cached in Dexie.
- Frontend: books and movies lists, cards, filter sheet, sort menu, search-in-list, counts, favorite/seen toggles, delete, description sheet, cover link, add-draft sheet (provider search plugs in via `media-search`).

## Impact
Capability `media` (filters included). Schema is V001; V001 already has the composite key `(user_id, id)` and the uniqueness indexes, so this change adds no migration. The contract needs amendments before the write tasks can start (design section 9). Depends on `mock-user` (`CurrentUserProvider`, test kit). No outbox yet: writes are online write-through; `offline-sync` replaces the transport only.

## Non-goals
Search proxy and TMDb key (`media-search`), outbox, `/sync/*` and `mutationId` handling (`offline-sync`), user ratings, draft promotion, pagination.

The spec deltas were folded into `docs/openspec/specs/media`.

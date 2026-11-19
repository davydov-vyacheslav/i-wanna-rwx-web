# Change: media-core

## Why
Phase 3, first change (`media-search` follows; Phase 2 settings and data sources are done and archived): the personal lists of books and movies/TV, the heart of the app. Online-first: TanStack Query over the API, no Dexie, no outbox, no sync (Phase 5).

## What changes
- Contract and schema (first backend task, B1): restore `/api/v1/books*` and `/api/v1/movies*` (list, `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}`), schemas `Book`, `Movie`, `CreateBookRequest`, `CreateMovieRequest` (both `{id, sourceUrl}` only), `UpdateBookRequest`, `UpdateMovieRequest`, tags `books`/`movies`, `Problem` codes `duplicate` (+ `Problem.existingId`), `gone`, responses Duplicate/Gone/Conflict, and in V001 the tables `books` and `movies` (with a `source` enum column). Not restored now: `immutable_field` (unreachable over REST, returns with `/sync/push`), `change_seq` (sequence, trigger, indexes: Phase 5, V001 in place). Exact list in `design.md` section 9.
- Backend module `media`: books and movies CRUD; create is `{id, sourceUrl}` only. In this change the only recognized URL is the draft link (Google search of the typed text, via the `@Qualifier(MediaResolver.DRAFT)` resolvers of `datasource`); every other URL is 400 `validation` on `sourceUrl` until `media-search` registers provider creation. Duplicate rules with 409 `duplicate` + `existingId`, per-row `version`/`updatedAt`/tombstone, per-user write lock inside `media`.
- Account export gets books and movies back (contributor methods) and account deletion cascades.
- Filters, sort, list search, counts: client-side over the full per-user list.
- Frontend: tab bar Books/Movies/Settings, list screens, cards, filter sheet, sort menu, list search, counts, favorite/seen toggles, delete behind a confirmation dialog (no Undo: Phase 5), description sheet, cover link, add sheet with the draft entry and an empty provider slot for `media-search`, behind a thin `repository.ts` seam.

## Impact
Capabilities `media` (delta in `specs/media`) and `settings` (tab navigation delta). V001 edited in place (not deployed). New dependencies: none (MapStruct, Testcontainers already in the build).

## Non-goals
Search and details endpoints, provider create, TV refresh (`media-search`); Dexie, outbox, `/sync/*`, `mutationId`, `change_seq`, `immutable_field`, offline banners, pending dots, Undo, offline drafts (Phase 5); user ratings, draft promotion, pagination.

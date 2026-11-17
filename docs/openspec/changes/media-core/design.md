# Design: media-core

Sources of truth: `backend/src/main/resources/db/migration/V001__initial_schema.sql` (schema), `api/openapi.yaml` (contract). Field names below are the contract's (`isbn`, `originalTitle`, `tvStatus`, `author`, `externalId`, `externalLink`, `coverUrl` for books, `posterUrl` for movies, `seasonCount`, `isFavorite`).

## 1. Decisions and trade-offs
| Question | Decision | Why / rejected |
|---|---|---|
| Where do filters, sort, search-in-list, counts run? | Client-side over the full per-user list in Dexie. | Must work offline; instant; filter/sort state is device-local; "total" is the list length; title sort must be `Intl.Collator` locale-aware (roadmap Q9), not reproducible with Postgres collations. A personal library is hundreds to low thousands of rows. Server filtering rejected: needs network, two implementations of the same rules. The list endpoints take no filter parameters. |
| Books and movies: one table or two? | Two (`books`, `movies`), as in V001. | Matches `offline-sync` resource types, different fields. Shared Java code via a small base class/mapper. |
| Primary key | `(user_id, id)` in V001, `id` = client UUID. | With V001's sole `id` key, user B posting A's UUID would collide with A's row and reveal its existence; cross-user must be 404/no collision by construction. |
| Write style | REST as in the contract: `POST` creates with a client UUID, `PATCH /{id}` changes status/favorite, `DELETE /{id}` tombstones. Offline, the same service is called by `/sync/push` (`offline-sync`); the contract's sync `upsert` carries record state. No idempotent `PUT`. | Contract is authoritative. Idempotency for REST comes from the client id: re-POSTing an existing live id returns 200 with the stored record (body ignored; changes go through PATCH). |
| Retry/no-op | If the incoming content equals stored content, no UPDATE is issued: no version bump, no `updatedAt` change. | The V001 trigger stamps `change_seq` on every UPDATE, so an identical write must skip the statement, otherwise pull cursors churn. TV refresh "bump only if changed" falls out. |
| Concurrency | Server LWW (arrival order), `version` +1 per accepted change, set by the service (the trigger only stamps `change_seq`). `PATCH.version` is the client's base version: a stale one is applied anyway (LWW); the conflict flag exists only on `/sync/push`. | Per `offline-sync`. |
| Clock | `updated_at` set by the server `Clock`; client never sends it. | Device clocks are untrusted. |
| Delete | Soft: `deleted_at`, `version`+1 (trigger stamps a new `change_seq`). Delete on a tombstone = 204; unknown or foreign id = 404. POST/PATCH on a tombstoned id = 410 and recreates nothing. Live reads never return tombstones. | "No resurrection" (V001 column comment); purge (90 d) is `offline-sync`'s job. |
| Source identity | Implicit: a book with `externalId` is Open Library, a movie with `externalId` is TMDb, no `externalId` = draft. No separate source name. | V001/contract have no source column; the provider follows from the resource type, the draft from the missing id. |
| Duplicates | Detected client-side for the "in library" UI and enforced server-side with `409 code=duplicate` + `existingId`. | Two offline devices can add the same item with different UUIDs; the client drops its row and adopts `existingId`. |
| Immutable fields | `isbn`, `externalId`, `externalLink`, and movie `type` cannot change after creation. `isbn` and the book/movie source fields are in that set. The REST contract cannot express a change (PATCH carries only status/favorite/version and, for tv, `seasonCount`/`tvStatus`); the rule applies to sync upserts (`immutable_field`). | Identity keys of duplicate detection; draft promotion is out of scope. |
| Per-user write serialization | Every write first locks the user's `users` row (`SELECT ... FOR UPDATE`) inside the caller's transaction. | (a) The duplicate checks an index cannot express (draft title vs a non-draft item, original title, NFC) are race-free; (b) V001's `change_seq` comes from one global sequence, so values from concurrent transactions can commit out of order and a pull cursor could skip a row; serializing per user makes a user's `change_seq` commit in order. Cost: one lock per user, irrelevant at this scale. Replaces the earlier `change_counters` table, which V001 makes unnecessary. |

## 2. Data
V001 (edited in place, nothing is deployed) already has everything this change needs: `books` and `movies` keyed `(user_id, id)`; `version`, `change_seq` (trigger-stamped), `deleted_at`, `(user_id, change_seq)` indexes; `isbn` (books); `original_title`, `tv_status`, `season_count` (movies)); movie rating is `decimal(3,1)` so 10.0 fits.
Partial unique indexes over live rows (`deleted_at IS NULL`, so tombstones never block re-adding): books `(user_id, isbn)`, `(user_id, external_id)`, `(user_id, lower(btrim(title)))` for drafts; movies `(user_id, type, external_id)` and the same draft-title index. `type` is in the movie key because TMDb movie and TV ids are separate namespaces. What an index cannot express (draft title vs a non-draft item's title or original title, NFC) is the service's job (section 3) and noted in the table comments. No migration belongs to this change. The ISBN is stored normalized (no hyphens or spaces, uppercase X) by the service.
The `(user_id, change_seq)` indexes include tombstones (not partial), which pull needs.

## 3. Duplicate rules (ROADMAP Q7 defaults, adapted to the contract)
- Book: same normalized `isbn`, or same `externalId`, among the user's live books (both partial unique indexes; the service checks first to return `existingId`, and maps a unique violation of a lost race to the same 409).
- Movie: same `(type, externalId)`.
- Draft (no `externalId`, either list): same title compared case-insensitively after trim and Unicode NFC against any live item's `title` in that list (movies: also `originalTitle`). Draft vs draft is also enforced by an index; draft vs non-draft only by the service under the per-user lock. A real item is NOT blocked by an existing draft of the same title.
- Excluded from the check: the row with the same id (re-POST of an existing record is not a duplicate).
The client mirrors the same predicates in one pure function `findDuplicate(candidate, items)` (shared with media-search's "in library" mark).

## 4. Validation (server, 400 `validation` with `errors[]`)
`title` trimmed, 1..500; `description` blank -> stored as null, max 20000; `author` max 500; `year` 1..3000; `rating` 0..5 for books and 0..10 for movies (read-only source rating; 0 or absent = unknown; no user ratings in v1); `coverUrl`/`posterUrl` `https://` only, max 2048; `externalId` per provider: Open Library `^OL\d{1,12}W$`, TMDb `^\d{1,10}$`; `externalLink` must be on the provider's host and end in the same id; a draft has no `externalId`, `externalLink`, `isbn` and rating absent or 0; `seasonCount` and `tvStatus` only when `type=tv`; `id` in a sync upsert payload equals `resourceId`; unknown JSON properties ignored. On TV refresh a null status never overwrites a stored one (client rule, media Q6).

## 5. API
- Tags `books` and `movies`; per resource: `GET` list (all live items, bare array), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Operation ids: `listBooks`, `getBook`, `createBook`, `updateBook`, `deleteBook` (movie equivalents).
- `POST` takes `CreateBookRequest`/`CreateMovieRequest`: client `id`, `title`, the writable item fields (movies: `type` required, `originalTitle`, `seasonCount`, `tvStatus`), optional `status`/`isFavorite`; no `externalId` = draft. Responses 200 (same id already live), 201, 400, 401, 409 `duplicate` (+ `existingId`), 410 `gone`. The sync `upsert` payload is the same schema. `PATCH` takes status/favorite/version (movies also `seasonCount`/`tvStatus`, tv only; the TV refresh write path): 400, 401, 404, 410. `DELETE`: 204 (idempotent), 401, 404. No list filter parameters.
- Read schemas `Book`/`Movie` include `id`, `userId`, `version`, `createdAt`, `updatedAt`. The path id is the record id; clients never send `userId`.
- Problem responses use the existing `Problem` schema (`code`, `errors[]`). Codes: `validation`, `duplicate` (with `existingId` on `Problem`), `immutable_field`, `gone`.
- Cross-user ids answer 404 on GET/PATCH/DELETE.

## 6. Module layout (Modulith)
- `com.javanix.rwx.sync`: published `UserWriteLock { void lock(UUID userId); }`, must be called inside the caller's transaction. Only this for now; `offline-sync` extends the module.
- `com.javanix.rwx.media`: depends on `identity` (`CurrentUserProvider`) and `sync`. Internal: `BookEntity`, `BookRepository`, `BookService`, `BookController implements BooksApi`, same for movies, `DuplicateDetector`, `MediaValidator`. Repository methods are only `...AndUserId`. Published API for `offline-sync` (so `sync` never touches media repositories): a `MediaMutations` interface applying a book or movie upsert/delete for a user with base version and returning applied/noop/rejected (reason, conflict flag). REST controllers and `/sync/push` go through the same service methods.
- Architecture test: reflection over `media` repositories asserts no inherited `findById/findAll/deleteById/existsById/save`-style unscoped methods are exposed (repositories extend `Repository<T,ID>`, not `JpaRepository`).

## 7. Frontend design
- Dexie v2 (in the per-user DB from mock-user): `books: '&id, updatedAt, externalId'`, `movies: '&id, updatedAt, type, externalId'` (user scoping is by database). Server rows stored verbatim including `version`.
- Single data seam `features/media/repository.ts`: `listBooks()`, `createBook(item)`, `updateBook(id, patch)`, `deleteBook(id)` etc. Today: call the API, then write the cache (write-through); list hook = TanStack Query over the cache with a background refetch of `GET /books` on mount/focus/`online`, replacing the cache atomically. `offline-sync` swaps the body for "write cache + outbox". Components never call the API or Dexie directly.
- Offline in this change: reads work from cache; writes show an error toast and are not queued (limitation until offline-sync).
- Pure modules with unit tests: `filters.ts` (tri-state cycle, default seen=exclude, series-ended reset, active count), `sort.ts` (`titleAsc` with `Intl.Collator(locale, {sensitivity:'base', numeric:true})` + id tie-break; `updatedDesc`), `search.ts`, `counts.ts`, `duplicates.ts`, `sourceUrl.ts` (cover tap URL: `externalLink`, else built from provider + `externalId`, else web search of the title for drafts).
- Filter/sort/search state: `localStorage` per list (`rwx.filters.books`, ...), keyed with the user id; unreadable -> default.
- 409 duplicate on create: drop the optimistic row, select the item `existingId`, toast "already in library".

## 8. Open questions resolved in the delta
media Q1 tap (not long-press), Q2 blank description = null, Q4 draft title case-insensitive trimmed, Q6 keep old on null, Q8 no user ratings, Q9 out of scope; filters Q1 collator, Q2 device-local, Q3 reset at default stays enabled, Q4 plain total kept. Q3 (ISBN) is resolved: the ISBN is part of the duplicate rule. Q5 (TV details failure) and Q7 live in `media-search`; Q10 (export) stays parked.

## 9. Contract and schema gaps
Resolved in `api/openapi.yaml` and V001 (former G1-G6): create requests with client id and writable fields, 200/409/410 on POST and 404/410 on PATCH/DELETE; `isbn`, `originalTitle`, `tvStatus` fields; PATCH writes `seasonCount`/`tvStatus`; list filter parameters removed; stale encryption comments fixed. Nothing remains open here.

## 10. For the owner
1. ROADMAP says duplicate title for drafts only; the iOS spec checked drafts against any item. We follow the iOS spec (draft vs any title in the same list). Say so if you prefer drafts-vs-drafts.
2. The contract and V001 now carry the media fields; the write tasks (B3+, F2+) can start after `mock-user`.

# Design: media-search

Sources of truth: `api/openapi.yaml` and `backend/src/main/resources/db/migration/V001__initial_schema.sql`. Operation ids and field names below are the contract's.

## 1. Modules
- `com.javanix.rwx.search`: depends on `identity` (`CurrentUserProvider`). Internal: `OpenLibraryClient`, `TmdbClient`, `SearchService`, `ExternalSourceService` (key save/delete/list), `RateLimiter`, controllers implementing the generated `search` and `settings` (`external-data-sources`) APIs. `/settings` GET/PATCH (timezone, locale, push) are not part of this change. The `media` module is NOT a dependency in either direction: the client builds a library item from search/details data and calls the create endpoint of `media-core`.

## 2. TMDb key storage (no encryption for now)
- Owner decision: no encryption, no `user_secrets`, no `crypto` module. The key lives in V001 `external_data_source_configuration` (`source_type = tmdb`, unique per user and source, `api_key` text). `api_key_version` stays null; it is the hook for adding AES-GCM later (the `search` spec and `ROADMAP.md` still say "encrypted"; the contract and V001 now say stored as is: reconcile the docs when encryption is revisited). Consequence to accept: DB dumps and backups contain the key in clear; protect them accordingly.
- Saving again replaces the key (upsert on the unique pair). All queries are scoped by `user_id`; another user's row is never reachable.
- Never returned: `ExternalDataSourceConfig` has no key field and no endpoint returns the key or a derived part (no last4); never logged; request/response body logging for `/external-data-sources` disabled; key excluded from exception messages; entity `toString` omits it. The request field `apiKey` is write-only in the UI (masked placeholder when saved, no reveal).
- Token status: V001 has no status column, so `SearchSource.status` is derived. Saved key -> `unknown`; after a successful save validation in this process -> `ok`; a 401 from TMDb during search/details sets an in-memory `rejected` marker per user (lost on restart, cleared by the next save) and does NOT delete the key; network errors never change status. No key -> `unknown` with `tokenSaved=false`.
- `DELETE /external-data-sources/tmdb` removes the row immediately, 204 also when none.

## 3. TMDb key handling
- Accepted: TMDb v4 "API Read Access Token" (JWT, sent as `Authorization: Bearer`) or v3 API key (32 hex chars). The UI asks for the v4 read token (recommended; stays out of URLs and proxy logs) but v3 keys are accepted and sent as the `api_key` query parameter with the outbound URL never logged. Format check: 20..512 chars, `[A-Za-z0-9._-]`.
- Save = validate first: `GET https://api.themoviedb.org/3/authentication`. 200 -> store, respond 201 with the config. 401 -> 422 `tmdb_token_rejected`, nothing stored. Network/timeout/5xx -> 502/504, nothing stored (user may retry). Format violation -> 400 `validation`.

## 4. Provider access
- Fixed hosts only: `openlibrary.org`, `api.themoviedb.org` (base URLs are properties for WireMock in tests; `https` enforced outside tests). Ids from clients are validated before use: Open Library `^OL\d{1,12}W$`, TMDb `^\d{1,10}$`; TMDb `type` is `movie|tv`. Query: trimmed, 3..200 chars. No redirects followed. Response body capped at 2 MB.
- Client: Spring `RestClient` on the JDK HttpClient; connect 3 s, read 8 s per request; no automatic retries. Header `User-Agent: RWX/<version> (<RWX_SEARCH_CONTACT>)` for Open Library (property required in non-dev profiles).
- Open Library: `search.json` with the fields and audiobook filter from the search spec; details `/works/<id>.json`. Cover = `https://covers.openlibrary.org/b/id/<cover_i>-L.jpg` built server-side. Ratings are 0..5, matching the books schema.
- TMDb: every call passes `language` = the user's `user_settings.locale` (en when null), so titles and descriptions follow the UI language. `search/multi`, drop `person`, first 10; details: movie `/movie/{id}` + `/credits`, tv `/tv/{id}` + `/tv/{id}/credits` (credits fetched in parallel on virtual threads). TV status mapping `Ended|Canceled` -> `ended`, other non-null -> `ongoing`, null -> absent. Image base from `/configuration`, cached in memory 24 h (global, not user data); poster size = smallest `poster_sizes` entry with width >= 250 (typically `w342`), fallback `w342`.
- Details responses include `externalLink` (provider page URL built server-side); search hits do not, so the client falls back to a URL built from the provider and `sourceId`.
- Short in-memory cache (Caffeine, 10 min, max 1000 entries) of normalized results keyed by (provider, query/id, locale for TMDb), for Open Library and for TMDb after the user's key check; holds public catalogue data only. Behind `rwx.search.cache.enabled` (default true).

## 5. Rate limiting
Per-user in-memory token buckets (single replica assumed; move to Postgres/Redis if the Helm chart ever runs >1 replica): search 30/min (burst 10), details 60/min (burst 20), key save 5/min. Exceeded -> `429` problem `rate_limited` with `Retry-After`. Global outbound guard: semaphore of 8 concurrent provider calls (excess waits max 2 s, then 503 `provider_error`). TV refresh is client-driven (sequential detail calls), so it fits the details bucket; the client must back off on 429.

## 6. Error mapping (RFC 9457 problems with `code`)
| Cause | Status | code |
|---|---|---|
| query < 3 or > 200 chars, bad id/type, bad key format | 400 | `validation` |
| TMDb call without saved key | 409 | `tmdb_token_missing` |
| TMDb answered 401 on a search/details call | 409 | `tmdb_token_invalid` |
| save: TMDb rejected the key | 422 | `tmdb_token_rejected` |
| provider 404 on details | 404 | `not_found` |
| provider 429 | 503 + `Retry-After` | `provider_rate_limited` |
| provider 4xx other / 5xx / malformed JSON | 502 | `provider_error` |
| timeout / connect failure | 504 | `provider_timeout` |
| our per-user limit | 429 | `rate_limited` |
Problem `detail` never echoes provider bodies, URLs, queries or the key. Logs: provider, status, latency at INFO; query text only at DEBUG.

## 7. API (already in `api/openapi.yaml`)
- Search (all require `q`, 3..200 chars; responses are bare arrays): `searchBooks` returns up to 10 `BookSearchHit` (`sourceId`, title, author, isbn, year, rating 0..5, `coverUrl`); `getBookDetails` by Open Library work id returns `BookDetails` (description, cover, year, `externalLink`); `searchMovies` returns up to 10 mixed movie/tv `MovieSearchHit`; `getMovieDetails` by `{type}/{sourceId}` returns `MovieDetails` (description, `posterUrl`, year, rating, `tvStatus`, `seasonCount`, `externalLink`). Movie operations need the user's key (409 otherwise).
- `listSearchSources`: `SearchSource` entries (`openlibrary|tmdb`, `available`, `tokenSaved`, `status`); drives the provider picker. Open Library is always available with `tokenSaved=false`.
- Key management: `listExternalDataSources` (configs, no key), `configureExternalDataSource` (POST `sourceType` + `apiKey`, 201; 400/422/429/502/504), `removeExternalDataSource` (204).
- `BookSearchHit.alreadyInLibrary` is not populated by the server (search must not depend on media); the client marks "in library" from its cache with `findDuplicate`.
- Error responses are `application/problem+json` using `Problem.code` from section 6.

## 8. Frontend design
- Add sheet = media-core shell + provider slot. Provider list comes from `GET /search/sources` (cached in Dexie `meta`; offline -> drafts only). Rules from the search spec: min 3 chars, 0.5 s debounce, TanStack Query with `signal` for cancellation, newest query wins, provider picker only when >1 available, error toast 3 s (cancelled = silent), in-library mark via `findDuplicate`.
- Add from result: fetch details (books: best-effort, failure -> search data; movies: required, failure -> toast with Retry and "Add without details" for search data), build the item with a fresh UUID (`externalId` = `sourceId`, `externalLink` from details or built from the id), create through the media-core repository.
- TV refresh: explicit action in the movies list menu; sequentially calls `getMovieDetails` for TV items with an `externalId`, writes only when `tvStatus` or `seasonCount` differ and the new status is non-null; stops with a toast on `tmdb_token_*`, backs off on 429. Write path: `PATCH /movies/{id}` with `seasonCount`/`tvStatus`.
- Settings "Sources": TMDb row with status icon (key saved / missing / rejected), write-only field with masked placeholder when saved (no reveal), Save / Delete, "how to get a key" link (v4 read access token), error messages per `code`.
- CSP/Workbox: `img-src` allows `covers.openlibrary.org` and `image.tmdb.org`; covers cached by the service worker later (Phase 5).

## 9. Trade-offs
- Client composes the library item (search -> details -> create) instead of a server "add from source" endpoint: keeps media independent of search and works with the offline outbox; cost: the client could submit forged metadata, acceptable (the data is the user's own). The contract's `CreateBookRequest`/`CreateMovieRequest` carry the client-composed item (client `id`, fields, `externalId`/`externalLink`).
- In-memory rate limiting: simplest, no new infra; resets on restart and is per replica.
- Plaintext key at rest: simplest, accepted by the owner for now; v4 vs v3 token: accept both, v3 in a query string is a leak risk mitigated by never logging outbound URLs.
- Derived token status: no schema change; `rejected` is lost on restart and the UI just re-learns it on the next failed search.

## 10. Gaps
- Fixed in the contract and V001: the apiKey wording (stored as is), `BookSearchHit.alreadyInLibrary` removed, `Movie` has `originalTitle`, `tvStatus`, `PATCH /movies/{id}` writes `seasonCount`/`tvStatus`.
- `MovieDetails` still has no `originalTitle` (only `MovieSearchHit` does): the client copies it from the hit.
- `SearchSource.id` is `openlibrary` (contract) while the media spec and UI copy say "Open Library": map in the client.

## 11. For the owner
1. TMDb credential type: the UI will ask for the v4 read access token and also accept a v3 key. OK?
2. Provide a contact (email or URL) for the Open Library User-Agent (`RWX_SEARCH_CONTACT`).

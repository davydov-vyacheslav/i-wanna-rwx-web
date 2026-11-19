# Delta: datasource (Phase 2: sources, user data sources, keys, resolvers)

Phase 2 part of the former combined `media-search` delta (split on the Phase 2 re-plan; the search, details, draft entry and add parts are in `docs/openspec/changes/media-search/specs/datasource/spec.md`, Phase 3). The capability `search` is renamed `datasource` when this change is folded in (move `docs/openspec/specs/search/spec.md` to `docs/openspec/specs/datasource/spec.md`, then apply this delta). The module is `datasource` (Java package `com.javanix.rwx.datasource`). Error codes are source-agnostic (`source_key_*`, the source in `Problem.source`). Replaces "Sources list and settings UI", "Per-user TMDb token" and "Token secrecy", and parts of "Proxy hardening" and "Search errors", in `docs/openspec/specs/search/spec.md`.

## MODIFIED Requirements

### Requirement: Data sources
The system SHALL offer data sources per type, each type with its own ordered list and its own configured default (`rwx.datasource.books.default` / `.movies.default`; the first listed source when unset). Today books have Open Library and movies and TV have TMDb. A source SHALL have an id, a label, whether it needs an API key, a per-user availability, a way to recognize its own page URLs, a way to search and to resolve an item and, when it needs a key, a way to validate one; adding a source SHALL NOT change the API shape. `GET /data-sources` SHALL return both lists with, per source, whether it is the user's default (`isDefault`), whether a search without `source` uses it (`isEffective`), whether it is available, whether a key is saved and whether a key is saved. A source that is unavailable (it needs a key and none is saved) is reported as such by `GET /data-sources`; how the add sheet presents it is Phase 3 (`media-search`).

#### Scenario: Lists per type
- **WHEN** an authenticated user calls `GET /data-sources`
- **THEN** `books` lists Open Library (available, no key needed) and `movies` lists TMDb (needs a key, unavailable until one is saved), each with `isDefault`, `isEffective`, `available` and `tokenSaved`

### Requirement: Search errors
Provider failures SHALL map to problems without provider bodies, URLs, queries or keys: connect or read timeout to 504 `provider_timeout`; 5xx, other 4xx, malformed or empty body to 502 `provider_error`, and any other client failure (without URI or message, no `source`) likewise; provider 429 to 503 `provider_rate_limited` with `Retry-After`; per-user limit to 429 `rate_limited` with `Retry-After`; a full outbound capacity to 503 `provider_error`; a source that needs a key used without one to 409 `source_key_missing`; the provider refusing the saved key (401) to 409 `source_key_invalid`; details not found to 404 `not_found`; a provider item that cannot be resolved on create because the provider has no such item to 422 `source_not_found`; a `sourceUrl` no source recognizes to 422 `unsupported_source`; invalid query, unknown `source` or over-long URL to 400. The codes SHALL NOT name a data source; a problem about one source SHALL name it in the `source` member (`source_key_*`, `source_not_found`, `provider_error`, `provider_rate_limited`, `provider_timeout`; not `rate_limited`, not the full-capacity `provider_error`). The same codes apply to a create. In Phase 2 the problems reachable over HTTP are those of saving a key (`PUT /data-sources/.../key`: 422 `source_key_rejected`, 504, 502, 503, 429, 400); the search, details and create surfaces and the client presentation (toasts, links to Settings) are Phase 3 (`media-search`).

#### Scenario: TMDb down on key save
- **WHEN** the user saves a TMDb key and the key check times out
- **THEN** the response is 504 `provider_timeout` with `source` `tmdb` and nothing is stored

#### Scenario: Key missing names the source
- **WHEN** a movie reference is resolved for a user without a saved TMDb key
- **THEN** the catalog fails with `SourceKeyMissing` for `tmdb`, which the advice maps to 409 `source_key_missing` with `source` `tmdb`

### Requirement: Proxy hardening
The backend SHALL call only the configured provider base URLs; it SHALL treat a client `sourceUrl` as data to parse (strictly: http or https, exact allowed host, no userinfo, default port only, no trailing dot, raw path matched against a fixed pattern, at most 4096 characters) and never as a target; validate provider ids (Open Library `OL<digits>W`, TMDb digits without leading zero, type `movie` or `tv`) and queries before any outbound call; use connect 3 s and read 8 s timeouts without retries, cap responses at 2 MB, not follow redirects, rate-limit per user (search 30/min with a burst of 10 per 10 s, details 60/min with a burst of 20, key save 5/min with a burst of 5) with at most 8 concurrent outbound calls (a call over the limit is rejected at once with 503 `provider_error`), identify itself to Open Library with a User-Agent containing a contact, and never log keys, outbound URLs, `sourceUrl`s or query text above DEBUG. URL recognition SHALL run before any rate-limit token is spent. Normalized public results MAY be cached in memory for 10 minutes; the cache SHALL NOT hold keys. Clients SHALL render a link only when it is an https URL.

#### Scenario: SSRF
- **WHEN** a `sourceUrl` is `http://169.254.169.254/works/OL1W`, `https://openlibrary.org@evil.com/works/OL1W` or `https://openlibrary.org.evil.com/works/OL1W`
- **THEN** the recognizer yields no reference (422 `unsupported_source` once the endpoints exist, Phase 3) and no outbound request is made

#### Scenario: Rate limit
- **WHEN** a user saves a key 6 times within a minute
- **THEN** the 6th returns 429 `rate_limited` with `Retry-After` (the search and details buckets use the same limiter and are exposed in Phase 3)

### Requirement: Published catalog API
The `datasource` module SHALL publish a catalog API that identifies a source URL (pure, no I/O) into a provider reference (source, provider id, movie or tv type, canonical URL), resolves a reference for a user into a normalized item or fails with a typed catalog error; `datasource` SHALL NOT depend on `media`, and the consumers added in Phase 3 (the details endpoints and the create in `media`) SHALL use the same recognition, resolution and short-lived cache. The source SPI SHALL be internal to `datasource`. Provider values SHALL be normalized at ingest: bounded text lengths, ratings clamped, years in range, ISBN taken as the provider gives it (first non-blank, trimmed, not validated), covers and page links built by the server and never copied from the provider or the client; a missing title is the only provider-data error (502).

#### Scenario: Link canonical
- **WHEN** a canonical URL built by a source is re-submitted to the recognizer
- **THEN** it yields the same reference and the same canonical URL

## ADDED Requirements

### Requirement: User data sources
A user SHALL be able to make a source the default of a resource type (books and movies each have their own default) and to save an API key for a source that needs one. The state SHALL be stored per user, resource type and source: every user SHALL have exactly one default row per resource type, inserted when the user is created (the configured default of the type, no key); another row exists only for a saved key, and a row holding neither SHALL NOT exist. If the stored default's source is no longer registered, the configured default applies. A user SHALL have at most one default per resource type. Setting a default SHALL be idempotent and allowed for any registered source of the type, available or not. A key operation on a source that needs no key, or any operation on a pair of resource type and source that is not registered, SHALL be 404 `not_found`. Every read and write SHALL be scoped to the signed-in user.

#### Scenario: New user
- **WHEN** a user signs in for the first time and lists the data sources
- **THEN** the configured default of each type is the default (and the effective source when available), no key is saved, and the user has exactly one stored default row per type, written at sign-up

#### Scenario: Choose a default
- **WHEN** the user makes the second movie source the default and then the first
- **THEN** exactly one movie source is the default at any time and the book default is unchanged

#### Scenario: Setting the same default twice
- **WHEN** the same source is made the default twice
- **THEN** both calls succeed and nothing changes the second time

#### Scenario: Not registered or no key
- **WHEN** the user sets a default for a source that is not a source of that resource type, or saves a key for Open Library
- **THEN** the response is 404 `not_found` and nothing is stored

#### Scenario: Another user
- **WHEN** user B lists, sets a default or deletes a key
- **THEN** user A's defaults and keys are neither visible nor changed

### Requirement: Effective source
The effective source (`isEffective` in `GET /data-sources`, and what a search without `source` uses from Phase 3) SHALL be the effective source of the type: the user's default when it is available, otherwise the first available source in list order, otherwise the default (its own key problem is then reported). The fallback SHALL NOT change the stored default: when the key of a default source is deleted the choice is kept, the source becomes unavailable and the effective source moves on, and saving a key again makes it effective again. Deleting the key of the default keeps its row without the key; deleting the key of a source that is not the default SHALL leave no row for it. Resolving a reference and URL recognition SHALL NOT depend on the default.

#### Scenario: Default without a key
- **WHEN** the user made a key-requiring source the default and deletes its key
- **THEN** the source stays the default but is unavailable, the effective source is the first available one, and `isEffective` moves to that one

#### Scenario: Key saved again
- **WHEN** the user saves the key again
- **THEN** the source is the default and effective again

#### Scenario: Only one source and no key
- **WHEN** the only source of a type needs a key and none is saved
- **THEN** it stays the default and effective, and a resolve answers `SourceKeyMissing` naming the source (409 `source_key_missing` at the HTTP surface, Phase 3)

#### Scenario: Pasted URL ignores the default
- **WHEN** a TMDb reference is resolved and the user's movie default is another source
- **THEN** the item is resolved at TMDb with the user's TMDb key

### Requirement: Per-user API key
A source that needs a key (TMDb: a v4 read access token, preferred and requested by the UI, or a v3 API key) SHALL use the key saved by the user. Saving SHALL first validate the key with the source: accepted means stored; rejected means 422 `source_key_rejected` naming the source and nothing stored (an older key stays); network failure or timeout means 502 or 504 and nothing stored; a key that breaks the source's format is 400. Saving again SHALL replace the stored key and SHALL NOT change the default. Deleting SHALL remove the key immediately and is idempotent. A later 401 from the provider SHALL report 409 `source_key_invalid` without deleting the key (no key status is kept or returned). The key is stored as is until the owner decides on encryption and SHALL never be returned (no response carries it or any part of it, such as the last characters), logged, or put in an error message; it is not synced, cached on the client or exported.

#### Scenario: Invalid key
- **WHEN** the provider answers 401 to the validation call
- **THEN** the response is 422 `source_key_rejected` with the source named and no key is stored

#### Scenario: Network error on save
- **WHEN** the validation call times out
- **THEN** the response is 504 and no key is stored

#### Scenario: Key expires later
- **WHEN** a search gets 401 from the provider
- **THEN** the response is 409 `source_key_invalid`, the key is kept

#### Scenario: Key never read back
- **WHEN** any endpoint is called after saving
- **THEN** no body contains the key

#### Scenario: Delete key
- **WHEN** the user deletes the TMDb key
- **THEN** TMDb is no longer available in the add sheet

### Requirement: Sources settings UI
Settings SHALL show a "Sources" section fed by `GET /data-sources`: per resource type its sources with a label and state (available, needs a key); every row has the same shape; a source that needs a key shows its state as a button that opens a dialog with a write-only field (masked placeholder when saved, no reveal control), Save or Replace, a red trash button beside the field when a key is saved (Remove), a hint and a link under the field explaining how to get the key, and an error message per problem code naming the source (a failure keeps the dialog open and the field focused and is shown right under the field in a reserved one-line slot (a longer message grows the dialog by the difference), so the dialog keeps its size; editing the key clears it; saving closes the dialog, removing the key keeps it open and offers Save); and, only for a type with two or more registered sources, a control to choose the default. The default control SHALL accept an unavailable source and then show a short hint on that row (add a key or switch the default) instead of naming another source; the selected radio alone marks the default (no "Default" label). A ready source (no key needed, or a key saved) shows "Available" in green. The three mutations SHALL replace the cached `GET /data-sources` result with the response, so every consumer sees a change at once. Caching the list on the device for offline use belongs to the Offline/PWA phase.

#### Scenario: Add key
- **WHEN** the user saves a valid key
- **THEN** the list shows `tokenSaved` true and TMDb is `available` in the movies list

#### Scenario: One source per type
- **WHEN** every type has a single registered source
- **THEN** no default control is shown

#### Scenario: Choose a default
- **WHEN** a type has two sources and the user selects the second as the default
- **THEN** it is `isDefault` and, while available, `isEffective`

## REMOVED Requirements

### Requirement: Sources list and settings UI
Reason: replaced by "Sources settings UI" and the data sources requirements above (the sources list is `GET /data-sources`, which also carries the default choice).

### Requirement: Per-user TMDb token
Reason: replaced by "Per-user API key" (source-agnostic: any source that needs a key, codes `source_key_*`).

### Requirement: Token secrecy
Reason: merged into "Per-user API key". The deferred encryption decision (stored as is for now) is recorded there and in `docs/TODO.md`.

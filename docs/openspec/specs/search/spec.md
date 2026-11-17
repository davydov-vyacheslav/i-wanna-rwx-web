# Search

Provider search for the add sheet (books via Open Library, movies and TV via TMDb), item details, add-from-result, drafts, and the per-user TMDb token ("Sources" in Settings). List search (title substring on a list) belongs to filters-and-sorting, not here.

Contract: `api/openapi.yaml`. Schema: `V001`. Add-sheet visuals: `docs/design/design-system.md`, flows: `docs/design/INTERACTIONS.md`.

## Requirements

### Requirement: Book search
The system SHALL search books by title and author through Open Library via the backend, returning at most 10 hits with source id, title, main author, ISBN, year, rating and cover. Audiobook results SHALL be excluded.

#### Scenario: Search books
- **WHEN** the user types "Emma" in the add sheet
- **THEN** up to 10 books are listed with cover, title, author, year and rating

### Requirement: Movie and TV search
The system SHALL search movies and TV through TMDb via the backend, dropping person results and returning at most 10 hits with type (`movie` or `tv`), source id, title, original title, description, year, rating and poster. TMDb results SHALL be available only when the user has a usable TMDb token.

#### Scenario: Search movies
- **WHEN** the user has a TMDb token and types "Top Gear"
- **THEN** movies and series are listed with poster, title, year, rating and type

#### Scenario: No token
- **WHEN** the user has no TMDb token
- **THEN** the add sheet explains this and links to Settings, and drafts remain possible

### Requirement: Search input behaviour
The add sheet SHALL search only for queries of 3 to 200 trimmed characters, debounce typing by 0.5 s, let the newest query win, cancel superseded requests silently, show a provider picker only when more than one provider is available, mark results already in the library (row disabled), and disable search while offline.

#### Scenario: Short query
- **WHEN** the query has fewer than 3 characters
- **THEN** no request is sent and a hint is shown

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** search is disabled and only drafts are offered

### Requirement: Item details
The system SHALL provide details for a chosen result: for books description, cover and year (Open Library work id); for movies and TV description, poster, year, rating, and for TV series status (`ongoing` or `ended`) and number of seasons. TV status SHALL map `Ended` and `Canceled` to `ended`, other non-null values to `ongoing`, and null to unknown.

#### Scenario: Movie details
- **WHEN** details of a TMDb movie are requested
- **THEN** the description, poster, year and rating are returned

### Requirement: Client-composed add
The server SHALL expose search and details only. The client SHALL create the library item from them with a client-generated UUID through the media API, so adding works with the offline outbox. Book details failure SHALL fall back to search data. Movie or TV details failure SHALL show an error with Retry and an "Add without details" option, and the result row SHALL NOT remain disabled.

#### Scenario: Add a book
- **WHEN** the user taps a book result
- **THEN** details are fetched, an item with a fresh UUID is created from them, and the sheet closes

#### Scenario: TV details fail
- **WHEN** details of a TV result fail with `tmdb_token_invalid`
- **THEN** a toast with Retry is shown and the card is not stuck disabled

### Requirement: Drafts
The add sheet SHALL always offer to add the typed text as a draft (an item with no provider source) as soon as any text is entered, including when offline, without a TMDb token, or when no result matches. Drafts SHALL remain addable even if a same-titled item exists.

#### Scenario: Offline draft
- **WHEN** the device is offline and the user types "Dune"
- **THEN** only the draft row `Add "Dune" as draft` is available and adding it queues a normal create

### Requirement: Search errors
Provider failures SHALL map to problems without provider bodies, URLs, queries or tokens: connect or read timeout to 504 `provider_timeout`; 5xx, other 4xx or malformed body to 502 `provider_error`; provider 429 to 503 `provider_rate_limited` with `Retry-After`; per-user limit to 429 `rate_limited` with `Retry-After`; no token for TMDb to 409 `tmdb_token_missing`; TMDb 401 to 409 `tmdb_token_invalid`; details not found to 404; invalid query, id or type to 400. The client SHALL show a 3 s error toast and clear results; cancelled requests are silent.

#### Scenario: Open Library down
- **WHEN** Open Library returns 500
- **THEN** the response is 502 `provider_error` and the client shows the search error toast

### Requirement: Proxy hardening
The backend SHALL call only the configured provider hosts, validate ids (Open Library `OL<digits>W`, TMDb digits, type `movie` or `tv`) and queries before any outbound call, use connect 3 s and read 8 s timeouts without retries, cap responses at 2 MB, not follow redirects, rate-limit per user (search 30/min, details 60/min, token save 5/min) with at most 8 concurrent outbound calls, identify itself to Open Library with a User-Agent containing a contact, and never log tokens, outbound URLs or query text above DEBUG. Normalized public results MAY be cached in memory for 10 minutes; the cache SHALL NOT hold tokens.

#### Scenario: SSRF
- **WHEN** a source id is `http://evil`
- **THEN** the response is 400 and no outbound request is made

#### Scenario: Rate limit
- **WHEN** a user sends 31 searches within a minute
- **THEN** the 31st returns 429 with `Retry-After`

### Requirement: Per-user TMDb token
TMDb search SHALL use a credential saved by the user (v4 read access token preferred and requested by the UI, v3 API key accepted). Saving SHALL first validate the credential against TMDb: accepted means stored with status `ok`; rejected means 422 `tmdb_token_rejected` and nothing stored; network failure or timeout means 502 or 504 and nothing stored. Saving again SHALL replace the stored credential. Deleting SHALL remove it immediately and is idempotent. A later TMDb 401 SHALL set status `rejected` without deleting the token; network errors SHALL NOT change status.

#### Scenario: Invalid key
- **WHEN** TMDb answers 401 to the validation call
- **THEN** the response is 422 and no token is stored

#### Scenario: Network error on save
- **WHEN** the validation call times out
- **THEN** the response is 504 and no token is stored

#### Scenario: Token expires later
- **WHEN** a search gets 401 from TMDb
- **THEN** the response is 409 `tmdb_token_invalid` and the token is kept with status `rejected`

#### Scenario: Delete token
- **WHEN** the user deletes the token
- **THEN** TMDb is no longer available in the add sheet

### Requirement: Token secrecy
The TMDb token SHALL be write-only: stored encrypted at rest with AES-GCM under a versioned key bound to the owning user, decrypted only server-side for that user's requests, and never returned (no response carries it or any part of it, such as the last characters), never logged, and excluded from error messages. Key rotation SHALL re-encrypt lazily on use. The token is not synced, cached on the client or exported.

#### Scenario: Token never read back
- **WHEN** any endpoint is called after saving
- **THEN** no body contains the token

#### Scenario: Copied ciphertext
- **WHEN** a ciphertext is copied to another user's row
- **THEN** it cannot be decrypted

### Requirement: Sources list and settings UI
The system SHALL list the sources for the signed-in user: Open Library (always available, no token) and TMDb with `available`, whether a token is saved and its status (`unknown`, `ok`, `rejected`). Settings SHALL show a "Sources" section with Open Library as always available and TMDb with a status (saved, missing, rejected), a write-only field with a masked placeholder when saved and no reveal control, Save and Delete, a link explaining how to get a v4 read access token, and an error message per problem code. The source list MAY be cached on the device so the add sheet works offline (drafts only).

#### Scenario: Add token
- **WHEN** the user saves a valid key
- **THEN** the list shows a saved token with status `ok` and TMDb becomes available in the movies add sheet

#### Scenario: Rejected token
- **WHEN** the token status is `rejected`
- **THEN** Settings prompts the user to enter a new one

### Requirement: TV refresh
The movies list SHALL offer an explicit "refresh TV" action that fetches details sequentially for TV items with a provider source and updates an item only when status or season count differs and the new status is non-null. It SHALL stop with a toast on a `tmdb_token_*` error and back off on 429.

#### Scenario: Status changed
- **WHEN** a series was `ongoing` and TMDb now reports `ended`
- **THEN** the item is updated through the normal media write

### Requirement: Per-user isolation
Token reads, writes and rate limits SHALL be scoped to the signed-in user; one user SHALL NOT use or observe another's token. An isolation test SHALL cover this.

#### Scenario: Other user
- **WHEN** user B searches TMDb without a token while user A has one
- **THEN** user B gets 409 `tmdb_token_missing`

## Decisions (formerly open)
- TMDb results are requested in the language of the user's device locale (`user_settings.locale`: en, ru or uk; English fallback); Open Library is language-independent.

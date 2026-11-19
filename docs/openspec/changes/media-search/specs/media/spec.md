# Delta: media (media-search, Phase 3, provider sources)

Builds on `docs/openspec/changes/media-core/specs/media/spec.md` (create by `{id, sourceUrl}`, the draft source, `source` and `externalLink` on every item).

## MODIFIED Requirements

### Requirement: Book item
A book SHALL additionally have an ISBN (the first non-blank one the provider returns, not validated for the work, resolved by the server, the same one a search hit carries), source `open_library` (or `draft`) with the Open Library work id (such as `OL45804W`) as provider id, extracted by the server from the URL the client sent, and the canonical work page `https://openlibrary.org/works/<id>` as `externalLink`; year is the first publish year.

#### Scenario: Open Library book
- **WHEN** a book is created from the URL `https://openlibrary.org/works/OL45804W/Fantastic_Mr._Fox?edition=x`
- **THEN** the server stores title, author, description, cover, year, rating, the first ISBN, provider id `OL45804W` and the link `https://openlibrary.org/works/OL45804W`, and the client sent none of them

### Requirement: Movie and TV item
A movie item SHALL additionally have a type (`movie` or `tv`, taken by the server from the URL path), optional original title, source `tmdb` (or `draft`) with the TMDb numeric id as provider id, the canonical page `https://www.themoviedb.org/<type>/<id>` as `externalLink`, and for series a status (`ongoing` or `ended`) and number of seasons, all derived by the server. TMDb `Ended` or `Canceled` maps to `ended`, any other non-null status to `ongoing`, null to unknown. Movies and series share one list distinguished by type.

#### Scenario: Add a series
- **WHEN** a TMDb TV URL is posted
- **THEN** the server fetches status and seasons and the card shows "Status: Ended/Ongoing - N seasons" when known

#### Scenario: Same number, other type
- **WHEN** `https://www.themoviedb.org/movie/1396` and `https://www.themoviedb.org/tv/1396` are both posted
- **THEN** two items are created (different types are different identities)

### Requirement: Duplicate prevention
For a provider URL the server SHALL identify the item from the URL (source, provider id, and for movies the type) and check the live items for the same identity and the same id before calling the provider, and SHALL check the ISBN after resolving, always again under the user write lock before inserting. Different spellings of one page URL (slug, trailing path, query, `http`, `www.`) are the same identity.

#### Scenario: Same ISBN under another work id
- **WHEN** a resolved book has an ISBN already held by a live book
- **THEN** the response is 409 `duplicate` with that book's id and nothing is created

#### Scenario: Pasted URL of an item already in the library
- **WHEN** the posted URL is another spelling of the page of a live item
- **THEN** the response is 409 `duplicate` with its id and no provider request was made

# Delta: media (media-core, Phase 3)

Aligns the Phase 0 text with the ROADMAP domain: a closed `source` enum (`draft`, `open_library`, `tmdb`) instead of a source name, `externalId` on every item, create by `{id, sourceUrl}`. Folded in before the `media-search` delta, which modifies "Duplicate prevention", "Book item" and "Movie and TV item" again.

## MODIFIED Requirements

### Requirement: Item fields
Every item SHALL have a client-generated UUID id, a required title, optional description, cover URL, year and, for books, author, a read-only source rating (0 = unknown), a status (`planned` or `seen`, default `planned`), a favorite flag (default false), a `source` (closed enum: `draft`, `open_library` for books, `tmdb` for movies), an `externalId` (the provider id; for a draft the case-folded normalized title), an `externalLink` built by the server, and server-set `version` and `updatedAt`. The rating is the provider's average; the user cannot rate or edit items in v1. An item is a draft exactly when its `source` is `draft`.

#### Scenario: Add a draft
- **WHEN** the user taps the draft entry
- **THEN** the item is stored as `planned`, not favorite, with `source` `draft`, and the add sheet closes

### Requirement: Draft items
A draft SHALL be creatable from the typed text through the same create call as any item (`{id, sourceUrl}` with the draft link, the Google web-search URL of the text): `source` `draft`, `externalId` the title key (NFC, trimmed, case-folded), rating 0, no cover/author/year, title = the typed text, `externalLink` the rebuilt search link (movies: type `movie`). Drafts SHALL be available even when no data source is configured. Promoting a draft to a real source is out of scope.

#### Scenario: Cannot find
- **WHEN** the search text is non-empty
- **THEN** the add sheet offers the draft entry with the typed text as title

### Requirement: Duplicate prevention
A book SHALL be a duplicate of another live book of the user with the same normalized ISBN or the same `source` and `externalId`. A movie item SHALL be a duplicate of another live item with the same `source`, type and `externalId`. A draft SHALL be a duplicate of any live item of the same list whose title (movies: also original title) has the same title key (NFC, trimmed, case-insensitive); a non-draft item is not blocked by a draft of the same title. The client SHALL show duplicates as "in library" and the server SHALL reject them with 409 `duplicate` carrying `existingId`; the client then selects the existing item.

#### Scenario: Case-insensitive draft
- **WHEN** a draft "dune " is created and "Dune" exists (draft or provider item)
- **THEN** the response is 409 `duplicate` with the existing id

#### Scenario: Movie and series share a TMDb id number
- **WHEN** a movie and a series both have `externalId` 1396
- **THEN** both can be added

### Requirement: Status and favorite toggles
Each card SHALL have a heart (toggle favorite) and an eye (toggle `planned` and `seen`) button; both update `updatedAt`. A badge shows "Planned" or "Seen" and the source (`draft` translated by the client, a provider id shown as its name).

#### Scenario: Mark seen
- **WHEN** the eye button is pressed on a planned item
- **THEN** status becomes `seen` and, under the default filter, the item leaves the list

### Requirement: Versioning and immutability
Each item SHALL carry a server-incremented `version` (1 on creation, +1 per accepted change) and a server-set `updatedAt`; content identical to the stored item SHALL change neither. Source, `externalId`, `externalLink`, ISBN and type SHALL NOT change after creation: the API offers no way to change them (PATCH carries status, favorite and, for series, `seasonCount`/`tvStatus`); the sync upsert of Phase 5 rejects such a change with `immutable_field`.

#### Scenario: Retry
- **WHEN** the same PATCH is sent twice
- **THEN** the second response carries the same `version` and `updatedAt`

### Requirement: Item validation
The server SHALL validate request shapes (`id`, `sourceUrl` an http(s) URL, PATCH ranges, `seasonCount`/`tvStatus` only on series) and SHALL build every stored value itself (title, link, ids, covers), so the client supplies no item content. A blank description SHALL be stored as null, so it never counts as "has a description".

#### Scenario: Non-URL source
- **WHEN** a create carries a `sourceUrl` that is not an http(s) URL
- **THEN** the response is 400 `validation`

#### Scenario: Unknown source URL
- **WHEN** a create carries a URL no source recognizes (in this change: anything but a draft link)
- **THEN** the response is 400 `validation` on `sourceUrl` and nothing is created

### Requirement: Cover opens the source page
Tapping the cover SHALL open the item's `externalLink` when it is an https URL (the Open Library work page, the TMDb movie or tv page, or for a draft a web search of the title). Long-press offers "Copy link". A missing cover shows a type-specific placeholder; covers may be hotlinked and cached by the service worker.

#### Scenario: Open source
- **WHEN** the cover of an item whose `externalLink` is `https://www.themoviedb.org/tv/1396` is tapped
- **THEN** that page opens

### Requirement: Tri-state filters
Favorite, Seen and Draft filters SHALL each cycle `all` -> `include` -> `exclude` -> `all` on each tap. Matching: favorite = favorite flag; seen = status `seen`; draft = `source` `draft`.

#### Scenario: Cycle
- **WHEN** the Favorite row is tapped three times from `all`
- **THEN** the states are include, exclude, all

### Requirement: Book item
A book SHALL additionally have an ISBN (stored normalized, no hyphens or spaces, uppercase X) and `source` `open_library` or `draft`; for `open_library` the `externalId` is the work id (such as `OL45804W`); year is the first publish year. Until `media-search` ships, only drafts can be created.

#### Scenario: Draft book
- **WHEN** a book draft is created
- **THEN** it has no ISBN, author, year or cover

### Requirement: Movie and TV item
A movie item SHALL additionally have a type (`movie` or `tv`), optional original title, `source` `tmdb` or `draft` (a draft is always type `movie`), and for series a status (`ongoing` or `ended`) and number of seasons. TMDb `Ended` or `Canceled` maps to `ended`, any other non-null status to `ongoing`, null to unknown. Movies and series share one list distinguished by type.

#### Scenario: Draft movie
- **WHEN** a movie draft is created
- **THEN** its type is `movie` and it has no original title, seasons or status

### Requirement: Delete
An item SHALL be deletable by trailing swipe, the card button or the detail sheet, always after a confirmation dialog that names the item and says the deletion cannot be undone (there is no Undo before Phase 5). The delete is sent only on confirm; the item leaves the list only when the server has answered successfully, and a failed delete keeps the item and shows an error toast. Cancel, Escape or a scrim tap send nothing. Deletion is a server tombstone: it is hidden from reads, deleting twice succeeds, and an update for a tombstoned id returns 410 and recreates nothing. There is no edit screen. Phase 5 may replace the dialog by an Undo toast.

#### Scenario: Confirmed delete
- **WHEN** the user taps Delete (swipe, card or detail sheet) and confirms the dialog
- **THEN** the deletion is sent once and, after the server answers, the item disappears and the detail sheet closes

#### Scenario: Cancelled delete
- **WHEN** the user taps Delete and cancels the dialog
- **THEN** nothing is sent and the item stays

#### Scenario: Failed delete
- **WHEN** the confirmed delete fails
- **THEN** the dialog closes, the item stays and an error toast shows

## ADDED Requirements

### Requirement: Create by source URL
Create (`POST /books`, `POST /movies`) SHALL take only `{id, sourceUrl}`. A live item with that id SHALL be answered with 200 and the stored item before the URL is inspected; a tombstoned id with 410 `gone`; otherwise the server recognizes the source from the URL, never requests the URL, stores the item as `planned` and not favorite and answers 201. Two concurrent creates of the same item SHALL yield exactly one 201 and a 200 (same id) or 409 `duplicate` (other id).

#### Scenario: Re-POST
- **WHEN** the same `{id, sourceUrl}` is posted twice
- **THEN** the first answer is 201 and the second 200 with the same item

#### Scenario: Deleted id
- **WHEN** an id that was deleted is posted again
- **THEN** the response is 410 `gone` and nothing is created

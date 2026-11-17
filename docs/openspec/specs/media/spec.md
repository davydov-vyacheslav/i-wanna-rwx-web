# media Specification

> Phasing note: offline behaviour in this spec (cached list, outbox, Undo through the outbox, pending-sync indicators, offline drafts) is delivered by `offline-sync` in the Offline/PWA phase. `media-core` ships online-first: the same rules run over the list fetched from the API, with no Dexie cache or outbox, and delete has no Undo until then.

## Purpose
Personal lists of books and of movies/TV series ("inbox" of things to read or watch), plus the filtering, sorting, search-in-list and counts that apply to them. Items are added from a provider search result (see the search capability) or as a manual draft. Visuals: `docs/design/`. Schema: `backend/src/main/resources/db/migration/V001__initial_schema.sql`. Contract: `api/openapi.yaml`.

## Shared rules

### Requirement: Item fields
Every item SHALL have a client-generated UUID id, a required title, optional description, cover URL, year and, for books, author, a read-only source rating (0 = unknown), a status (`planned` or `seen`, default `planned`), a favorite flag (default false), a source name (provider or `Draft`) with optional source id, and a server-set `updatedAt`. The rating is the provider's average; the user cannot rate or edit items in v1.

#### Scenario: Add from search
- **WHEN** the user taps a provider result
- **THEN** details are fetched, the item is stored as `planned` and not favorite, and the add sheet closes

### Requirement: Draft items
A draft SHALL be creatable from the typed search text when the item cannot be found: source `Draft`, no source id, rating 0, no cover/author/year, title = typed text (movies: type `movie`). Drafts SHALL be available even when no search source is configured. Promoting a draft to a real source is out of scope.

#### Scenario: Cannot find
- **WHEN** the search text is non-empty
- **THEN** a "Can't find it?" entry offers a draft with the typed text as title

### Requirement: Duplicate prevention
A book SHALL be a duplicate of another live book of the user with the same normalized ISBN or the same source name and source id. A movie item SHALL be a duplicate of another live item with the same type, source name and source id. A draft SHALL be a duplicate of any live item of the same list with the same title, compared case-insensitively after trimming (movies: also original title); a non-draft item is not blocked by a draft of the same title. The client SHALL show duplicates as "in library" (checkmark, disabled) and the server SHALL reject them with 409 `duplicate` carrying `existingId`; the client then drops its local row and selects the existing item.

#### Scenario: Two devices add the same book offline
- **WHEN** a second create with a different UUID but the same ISBN arrives
- **THEN** the response is 409 with the first item's id

#### Scenario: Case-insensitive draft
- **WHEN** a draft "dune " is typed and "Dune" exists
- **THEN** it is shown as in library and the server answers 409

#### Scenario: Movie and series share a TMDb id number
- **WHEN** a movie and a series both have source id 1396
- **THEN** both can be added

### Requirement: Status and favorite toggles
Each card SHALL have a heart (toggle favorite) and an eye (toggle `planned` and `seen`) button; both update `updatedAt`. A badge shows "Planned" or "Seen" and the source name.

#### Scenario: Mark seen
- **WHEN** the eye button is pressed on a planned item
- **THEN** status becomes `seen` and, under the default filter, the item leaves the list

### Requirement: Delete
An item SHALL be deletable by trailing swipe or menu with no confirmation; an Undo toast SHALL restore it for 4 seconds. The client keeps the delete mutation in the outbox during the Undo window and drops it on Undo; a delete of a record whose create has not been sent cancels both mutations, so nothing is ever sent. After the window the delete is sent and Undo is no longer possible, because a tombstoned id is never recreated (410). Deletion is a server tombstone: it is hidden from reads, deleting twice succeeds, and an update for a tombstoned id returns 410 and recreates nothing. There is no edit screen.

#### Scenario: Swipe delete
- **WHEN** the user swipes a card and taps Delete
- **THEN** the item disappears at once and the deletion is sent

#### Scenario: Undo
- **WHEN** the user taps Undo in the toast
- **THEN** the item reappears with its previous content and the pending delete mutation is dropped

#### Scenario: Delete of an unsent create
- **WHEN** the user deletes an item whose create is still in the outbox
- **THEN** both mutations are cancelled and nothing is sent

### Requirement: Versioning and immutability
Each item SHALL carry a server-incremented `version` (1 on creation, +1 per accepted change) and a server-set `updatedAt`; content identical to the stored item SHALL change neither. Source name, source id, ISBN and type SHALL NOT change after creation (400 `immutable_field`).

#### Scenario: Retry
- **WHEN** the same write is sent twice
- **THEN** the second response carries the same `version`

#### Scenario: Change source id
- **WHEN** an update changes the source id of an existing item
- **THEN** the response is 400 with code `immutable_field`

### Requirement: Item validation
The server SHALL validate titles, value ranges, source id formats and draft invariants (a draft has no source id and rating 0). A blank description SHALL be stored as null, so it never counts as "has a description".

#### Scenario: Draft with source id
- **WHEN** a draft is sent with a source id
- **THEN** the response is 400

### Requirement: Description sheet
Tapping the title/meta area of a card SHALL open the item detail even when the item has no description (the detail holds the actions); when the item has a description the full text is shown there.

#### Scenario: Show description
- **WHEN** an item with a description is tapped
- **THEN** a sheet shows the full text

### Requirement: Cover opens the source page
Tapping the cover SHALL open the source page: Open Library work page, TMDb movie or tv page, or for a draft a web search of the title. Long-press offers "Copy link". A missing cover shows a type-specific placeholder; covers may be hotlinked and cached by the service worker.

#### Scenario: Open source
- **WHEN** the cover of a TMDb series with id 1396 is tapped
- **THEN** `https://www.themoviedb.org/tv/1396` opens

### Requirement: Card content
A card SHALL show cover, type icon, title (2 lines), year or an em dash, star and rating to one decimal ("N/A" when 0), author (or "No author"), TV extra meta, the two toggle buttons, and the status and source badges.

#### Scenario: No rating
- **WHEN** rating is 0
- **THEN** "N/A" is shown

### Requirement: Count label
The list header SHALL show the number of items: "<shown> of <total>" when a filter or search narrows the list, otherwise "<total>"; total is the unfiltered list size and nothing is shown when it is 0. An empty result shows "list is empty" text.

#### Scenario: Narrowed
- **WHEN** 40 books exist and 12 are shown
- **THEN** the header shows "12 of 40"

#### Scenario: Not narrowed
- **WHEN** all 40 are shown
- **THEN** the header shows "40"

## Books

### Requirement: Book item
A book SHALL additionally have an ISBN (the search hit's first), and source name `Open Library` or `Draft` with the Open Library work id (such as `OL45804W`) as source id; year is the first publish year.

#### Scenario: Open Library book
- **WHEN** an Open Library result is added
- **THEN** description, better cover and year are fetched, and the work id and first ISBN are stored

## Movies and TV

### Requirement: Movie and TV item
A movie item SHALL additionally have a type (`movie` or `tv`), optional original title, source name `TMDb` or `Draft` with the TMDb numeric id as source id, and for series a status (`ongoing` or `ended`) and number of seasons. TMDb `Ended` or `Canceled` maps to `ended`, any other non-null status to `ongoing`, null to unknown. Movies and series share one list distinguished by type.

#### Scenario: Add a series
- **WHEN** a TMDb TV result is added
- **THEN** credits, status and seasons are fetched and the card shows "Status: Ended/Ongoing - N seasons" when known

### Requirement: TV series refresh
Pull-to-refresh on the movies list (an explicit action needing the user's TMDb token, never automatic in the background) SHALL re-fetch details of every TV item with a real source and update status and seasons. A null status from TMDb SHALL keep the stored value, and `updatedAt` changes only if a value changed.

#### Scenario: Series ended
- **WHEN** refresh finds `Ended` for an ongoing item
- **THEN** the item becomes `ended` and `updatedAt` changes

#### Scenario: Null status
- **WHEN** TMDb returns no status
- **THEN** the stored status is kept

## Filters and sorting

### Requirement: Client-side evaluation
Filters, sorting, list search and counts SHALL be evaluated on the client over the cached full per-user list so they work offline; the server list endpoints SHALL NOT accept filter, sort or paging parameters.

#### Scenario: Offline filtering
- **WHEN** the device is offline and the user changes the filter
- **THEN** the list updates from the local cache without a request

### Requirement: Tri-state filters
Favorite, Seen and Draft filters SHALL each cycle `all` -> `include` -> `exclude` -> `all` on each tap. Matching: favorite = favorite flag; seen = status `seen`; draft = source `Draft`.

#### Scenario: Cycle
- **WHEN** the Favorite row is tapped three times from `all`
- **THEN** the states are include, exclude, all

### Requirement: Default hides seen
The default for books and movies SHALL be seen = exclude, everything else `all`. Reset SHALL return to this default, stays enabled at the default, and the default counts as an active filter (filled icon, badge 1).

#### Scenario: First launch
- **WHEN** a list is opened for the first time
- **THEN** seen items are hidden and the filter badge shows 1

### Requirement: Type and series-ended filters
Books have no type filter. Movies SHALL have a single-select type (all, movies, series); tapping the selected type returns to all, and the sheet shows the type buttons only if more than one type exists. When the type is series a tri-state "Ended" filter SHALL appear (items of unknown status match `exclude`); whenever the type is not series it resets to `all`.

#### Scenario: Leaving series
- **WHEN** ended = include and the type changes to movies
- **THEN** ended resets to all

### Requirement: Active filter indicator
The toolbar filter button SHALL show a filled icon when any filter differs from `all` and a badge with the number of active criteria (type, favorite, seen, draft, ended count 1 each).

#### Scenario: Badge
- **WHEN** seen = exclude and favorite = include
- **THEN** the badge shows 2

### Requirement: Sort options
Books and movies SHALL offer `titleAsc` (default) and `updatedDesc` (newest `updatedAt` first), with the active option checked in a sort menu. `titleAsc` SHALL use a locale-aware, case-insensitive, numeric-aware collator with ties broken by id.

#### Scenario: Mixed case
- **WHEN** titles are "dune", "Alien", "Zodiac"
- **THEN** the order is Alien, dune, Zodiac

#### Scenario: Recently changed
- **WHEN** sort = updatedDesc and the user marks an item seen
- **THEN** it moves to the top if still visible

### Requirement: List search
Each list SHALL have a search field doing a case-insensitive, locale-aware substring match on title only, applied on top of the filters.

#### Scenario: Search within filter
- **WHEN** seen items are hidden and "dune" is entered
- **THEN** only unseen items whose title contains "dune" are shown

### Requirement: Device-local state
Filter state per list and sort per list SHALL be stored on the device only, keyed by user id, never synced and never in the outbox; unreadable state falls back to the default.

#### Scenario: Another user on the same device
- **WHEN** a different user signs in
- **THEN** the lists start from the default filters

## Decisions (formerly open)
- A draft title is checked against any live item of the same list, not only drafts (iOS parity).
- There is no media-specific export feature (the iOS JSON export is removed); the account data export lives in `identity`.
- The item detail opens on tap even without a description.

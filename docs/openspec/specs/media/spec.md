# media Specification

> Phasing note: Phase 3 ships the lists online-first: the same rules run over the list fetched from the API (TanStack Query), with no Dexie cache or outbox. Offline behaviour in this spec (cached list, outbox, Undo through the outbox, pending-sync indicators, offline drafts) is delivered by `offline-sync` in the Offline/PWA phase; until then a write made offline fails and nothing is queued, and delete has no Undo.

## Purpose
Personal lists of books and of movies/TV series ("inbox" of things to read or watch), plus the filtering, sorting, search-in-list and counts that apply to them. Items are added from a provider search result or as a manual draft (see the `datasource` capability for search, details and the add sheet). Visuals: `docs/design/`. Schema: `backend/src/main/resources/db/migration/V001__initial_schema.sql`. Contract: `api/openapi.yaml`.

## Shared rules

### Requirement: Item fields
Every item SHALL have a client-generated UUID id, a required title, optional description, cover URL, year and, for books, author, a read-only source rating (0 = unknown), a status (`planned` or `seen`, default `planned`), a favorite flag (default false), a `source` (closed enum: `draft`, `open_library` for books, `tmdb` for movies), an `externalId` (the provider id; for a draft the case-folded normalized title), an `externalLink` built by the server, and server-set `version` and `updatedAt`. The rating is the provider's average; the user cannot rate or edit items in v1. An item is a draft exactly when its `source` is `draft`.

#### Scenario: Add a draft
- **WHEN** the user taps the draft entry
- **THEN** the item is stored as `planned`, not favorite, with `source` `draft`, and the add sheet closes

### Requirement: Create by source URL
Create (`POST /books`, `POST /movies`) SHALL take only `{id, sourceUrl}`. A live item with that id SHALL be answered with 200 and the stored item before the URL is inspected; a tombstoned id with 410 `gone`; otherwise the server recognizes the source from the URL, never requests the URL, stores the item as `planned` and not favorite and answers 201. Two concurrent creates of the same item SHALL yield exactly one 201 and a 200 (same id) or 409 `duplicate` (other id).

#### Scenario: Re-POST
- **WHEN** the same `{id, sourceUrl}` is posted twice
- **THEN** the first answer is 201 and the second 200 with the same item

#### Scenario: Deleted id
- **WHEN** an id that was deleted is posted again
- **THEN** the response is 410 `gone` and nothing is created

### Requirement: Draft items
A draft SHALL be creatable from the typed text through the same create call as any item (`{id, sourceUrl}` with the draft link, the Google web-search URL of the text): `source` `draft`, `externalId` the title key (NFC, trimmed, case-folded), rating 0, no cover/author/year, title = the typed text, `externalLink` the rebuilt search link (movies: type `movie`). Drafts SHALL be available even when no data source is configured. Promoting a draft to a real source is out of scope.

#### Scenario: Cannot find
- **WHEN** the search text is non-empty
- **THEN** the add sheet offers the draft entry with the typed text as title

### Requirement: Duplicate prevention
A book SHALL be a duplicate of another live book of the user with the same normalized ISBN or the same `source` and `externalId`. A movie item SHALL be a duplicate of another live item with the same `source`, type and `externalId`. A draft SHALL be a duplicate of any live item of the same list whose title (movies: also original title) has the same title key (NFC, trimmed, case-insensitive); a non-draft item is not blocked by a draft of the same title. For a provider URL the server SHALL identify the item from the URL (source, provider id, and for movies the type) and check the live items for the same identity before calling the provider, SHALL check the ISBN after resolving, and SHALL always check again under the user write lock before inserting. Different spellings of one page URL (slug, trailing path, query, `http`, `www.`) are the same identity. The client SHALL show duplicates as "in library" and the server SHALL reject them with 409 `duplicate` carrying `existingId`; the client then selects the existing item.

#### Scenario: Case-insensitive draft
- **WHEN** a draft "dune " is created and "Dune" exists (draft or provider item)
- **THEN** the response is 409 `duplicate` with the existing id

#### Scenario: Movie and series share a TMDb id number
- **WHEN** a movie and a series both have `externalId` 1396 (`https://www.themoviedb.org/movie/1396` and `.../tv/1396` are both posted)
- **THEN** both can be added (different types are different identities)

#### Scenario: Same ISBN under another work id
- **WHEN** a resolved book has an ISBN already held by a live book
- **THEN** the response is 409 `duplicate` with that book's id and nothing is created

#### Scenario: Pasted URL of an item already in the library
- **WHEN** the posted URL is another spelling of the page of a live item
- **THEN** the response is 409 `duplicate` with its id and no provider request was made

### Requirement: Status and favorite toggles
Each card SHALL have a heart (toggle favorite) and an eye (toggle `planned` and `seen`) button; both update `updatedAt`. A badge shows "Planned" or "Seen" and the source (`draft` translated by the client, a provider id shown as its name).

#### Scenario: Mark seen
- **WHEN** the eye button is pressed on a planned item
- **THEN** status becomes `seen` and, under the default filter, the item leaves the list

### Requirement: Delete
An item SHALL be deletable by trailing swipe, the card button or the detail sheet, always after a confirmation dialog that names the item and says the deletion cannot be undone (there is no Undo before Phase 5). The delete is sent only on confirm; the item leaves the list only when the server has answered successfully, and a failed delete keeps the item and shows an error toast. Cancel, Escape or a scrim tap send nothing. Deletion is a server tombstone: it is hidden from reads (GET of a tombstone is 404), deleting twice succeeds, and an update for a tombstoned id returns 410 and recreates nothing. There is no edit screen. Phase 5 may replace the dialog by an Undo toast.

#### Scenario: Confirmed delete
- **WHEN** the user taps Delete (swipe, card or detail sheet) and confirms the dialog
- **THEN** the deletion is sent once and, after the server answers, the item disappears and the detail sheet closes

#### Scenario: Cancelled delete
- **WHEN** the user taps Delete and cancels the dialog
- **THEN** nothing is sent and the item stays

#### Scenario: Failed delete
- **WHEN** the confirmed delete fails
- **THEN** the dialog closes, the item stays and an error toast shows

### Requirement: Versioning and immutability
Each item SHALL carry a server-incremented `version` (1 on creation, +1 per accepted change) and a server-set `updatedAt`; content identical to the stored item SHALL change neither. Source, `externalId`, `externalLink`, ISBN and type SHALL NOT change after creation: the API offers no way to change them (PATCH carries status, favorite and, for series, `seasonCount`/`tvStatus`; its `version` is informational, last write wins); the sync upsert of Phase 5 rejects such a change with `immutable_field`.

#### Scenario: Retry
- **WHEN** the same PATCH is sent twice
- **THEN** the second response carries the same `version` and `updatedAt`

### Requirement: Item validation
The server SHALL validate request shapes (`id`, `sourceUrl` an http(s) URL, PATCH ranges, `seasonCount`/`tvStatus` only on series) and SHALL build every stored value itself (title, link, ids, covers), so the client supplies no item content. A blank description SHALL be stored as null, so it never counts as "has a description". A URL no source recognizes (or whose content is invalid) is invalid input, not a separate error: 400 `validation` on `sourceUrl`.

#### Scenario: Non-URL source
- **WHEN** a create carries a `sourceUrl` that is not an http(s) URL
- **THEN** the response is 400 `validation`

#### Scenario: Unknown source URL
- **WHEN** a create carries a URL no source recognizes (an unknown host, a non-http(s) scheme, or an Open Library page on `/movies`)
- **THEN** the response is 400 `validation` on `sourceUrl` and nothing is created

#### Scenario: Series fields on a movie
- **WHEN** a PATCH of a movie carries `seasonCount` or `tvStatus`
- **THEN** the response is 400 `validation`

### Requirement: Description sheet
Tapping the title/meta area of a card SHALL open the item detail even when the item has no description (the detail holds the actions); when the item has a description the full text is shown there. The open area has no focus indicator (owner decision); the card's other buttons keep the global focus ring.

#### Scenario: Show description
- **WHEN** an item with a description is tapped
- **THEN** a sheet shows the full text

### Requirement: Cover opens the source page
Tapping the cover SHALL open the item's `externalLink` in a new tab when it is an https URL (the Open Library work page, the TMDb movie or tv page, or for a draft a web search of the title); a cover without an https link is not a link. There is no long-press or "Copy link" affordance. A missing cover shows a type-specific placeholder; covers may be hotlinked and cached by the service worker.

#### Scenario: Open source
- **WHEN** the cover of an item whose `externalLink` is `https://www.themoviedb.org/tv/1396` is tapped
- **THEN** that page opens

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

### Requirement: Navigation shell
After sign-in the app SHALL show Books, Movies and Settings as the top-level entries, reachable in one tap from anywhere: below 768px as a bottom tab bar, from 768px as a left sidebar with the same entries, and sheets are bottom sheets on phones and centered dialogs on wide screens. The current entry is kept in the URL hash (`#/books`), the last entry is restored per user on the device (first launch, a missing or corrupt value: Books), tapping the current entry scrolls to the top, and each screen stays mounted after its first visit. The Settings screen itself is unchanged (see `settings`).

#### Scenario: Restore the last tab
- **WHEN** the user left on Movies and opens the app again without a hash
- **THEN** Movies is shown and its entry is marked current

## Books

### Requirement: Book item
A book SHALL additionally have an ISBN (the first non-blank one the provider returns, not validated for the work, resolved by the server, the same one a search hit carries; stored normalized: no hyphens or spaces, uppercase X), `source` `open_library` (or `draft`) with the Open Library work id (such as `OL45804W`) as provider id, extracted by the server from the URL the client sent, and the canonical work page `https://openlibrary.org/works/<id>` as `externalLink`; year is the first publish year.

#### Scenario: Open Library book
- **WHEN** a book is created from the URL `https://openlibrary.org/works/OL45804W/Fantastic_Mr._Fox?edition=x`
- **THEN** the server stores title, author, description, cover, year, rating, the first ISBN, provider id `OL45804W` and the link `https://openlibrary.org/works/OL45804W`, and the client sent none of them

#### Scenario: Draft book
- **WHEN** a book draft is created
- **THEN** it has no ISBN, author, year or cover

## Movies and TV

### Requirement: Movie and TV item
A movie item SHALL additionally have a type (`movie` or `tv`, taken by the server from the URL path; a draft is always type `movie`), optional original title, `source` `tmdb` (or `draft`) with the TMDb numeric id as provider id, the canonical page `https://www.themoviedb.org/<type>/<id>` as `externalLink`, and for series a status (`ongoing` or `ended`) and number of seasons, all derived by the server. TMDb `Ended` or `Canceled` maps to `ended`, any other non-null status to `ongoing`, null to unknown. Movies and series share one list distinguished by type.

#### Scenario: Add a series
- **WHEN** a TMDb TV URL is posted
- **THEN** the server fetches status and seasons and the card shows "Status: Ended/Ongoing - N seasons" when known

#### Scenario: Draft movie
- **WHEN** a movie draft is created
- **THEN** its type is `movie` and it has no original title, seasons or status

### Requirement: TV series refresh
The "Refresh series status" action in the More menu of the movies list (an explicit action needing the user's TMDb key, never automatic in the background and not pull-to-refresh) SHALL re-fetch details of every series with a real source and update status and seasons through the normal update; the flow, errors and rate-limit handling are in `datasource` (TV refresh). A null status from TMDb SHALL keep the stored value, and `updatedAt` changes only if a value changed.

#### Scenario: Series ended
- **WHEN** refresh finds `Ended` for an ongoing item
- **THEN** the item becomes `ended` and `updatedAt` changes

#### Scenario: Null status
- **WHEN** TMDb returns no status
- **THEN** the stored status is kept

## Filters and sorting

### Requirement: Client-side evaluation
Filters, sorting, list search and counts SHALL be evaluated on the client over the full per-user list it holds (fetched as one bare array); the server list endpoints SHALL NOT accept filter, sort or paging parameters. Working from a device cache while offline arrives with `offline-sync` (Phase 5).

#### Scenario: Filtering without a request
- **WHEN** the user changes the filter
- **THEN** the list updates from the list already held, without a request

### Requirement: Tri-state filters
Favorite, Seen and Draft filters SHALL each cycle `all` -> `include` -> `exclude` -> `all` on each tap. Matching: favorite = favorite flag; seen = status `seen`; draft = `source` `draft`.

#### Scenario: Cycle
- **WHEN** the Favorite row is tapped three times from `all`
- **THEN** the states are include, exclude, all

### Requirement: Default hides seen
The default for books and movies SHALL be seen = exclude, everything else `all`. Reset SHALL return to this default, stays enabled at the default, and the default counts as an active filter (filled icon, badge 1).

#### Scenario: First launch
- **WHEN** a list is opened for the first time
- **THEN** seen items are hidden and the filter badge shows 1

### Requirement: Type and series-ended filters
Books have no type filter. Movies SHALL have a single-select type (all, movies, series) shown as a segmented control under the search row (not in the filter sheet); tapping the selected type returns to all, and the control is shown only if more than one type exists or a type is selected. When the type is series a tri-state "Ended" filter SHALL appear in the sheet (items of unknown status match `exclude`); whenever the type is not series it resets to `all`.

#### Scenario: Leaving series
- **WHEN** ended = include and the type changes to movies
- **THEN** ended resets to all

### Requirement: Active filter indicator
The toolbar filter button SHALL show a filled icon when any filter differs from `all` and a badge with the number of active criteria (type, favorite, seen, draft, ended count 1 each).

#### Scenario: Badge
- **WHEN** seen = exclude and favorite = include
- **THEN** the badge shows 2

### Requirement: Sort options
Books and movies SHALL offer `titleAsc` (default) and `updatedDesc` (newest `updatedAt` first), with the active option checked in a sort menu. `titleAsc` SHALL use a locale-aware (the effective UI locale), case-insensitive, numeric-aware collator with ties broken by id.

#### Scenario: Mixed case
- **WHEN** titles are "dune", "Alien", "Zodiac"
- **THEN** the order is Alien, dune, Zodiac

#### Scenario: Russian titles sort with the Russian collator
- **WHEN** the effective locale is `ru` and a list is sorted by title
- **THEN** titles are ordered with the Russian collator

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
- A URL no source recognizes is 400 `validation` on `sourceUrl` (owner decision 2026-11-19); there is no `unsupported_source` code.
- Delete always asks for confirmation and waits for the server (owner decision; no Undo before Phase 5).
- The big open area of a card shows no focus indicator (owner decision).
- Wide screens (>= 768px) use a sidebar and centered dialogs (owner decision 2026-11-19).

# Delta: media (pwa-install)

## MODIFIED Requirements

### Requirement: Cover opens the source page
Tapping the cover SHALL open the item's `externalLink` in a new tab when it is an https URL (the Open Library work page, the TMDb movie or tv page, or for a draft a web search of the title); a cover without an https link is not a link. There is no long-press or "Copy link" affordance. An item without a cover, or whose cover image fails to load, SHALL show the artwork placeholder of its type (book or movie, the iOS app's `draft_book` / `draft_movie` images; the dark variant under `prefers-color-scheme: dark`, 1x to 3x by device density), decorative for assistive technology. Covers may be hotlinked from `covers.openlibrary.org` and `image.tmdb.org` and are cached by the service worker (see `platform`).

#### Scenario: Cover without source link
- **WHEN** an item has a cover but no https `externalLink`
- **THEN** the cover is shown and is not a link

#### Scenario: No cover
- **WHEN** a book has no cover URL
- **THEN** the book placeholder is shown, in its dark variant in dark mode

#### Scenario: Broken cover
- **WHEN** a movie poster fails to load
- **THEN** the movie placeholder replaces it

# Desktop layout, sign-in and install walkthrough (Phase 5, design pass)

Scope: the layout from `md` (768px) up, the one shared table for Books, Movies, Subscriptions and Licenses, cover placeholders, the sign-in page and the Add-to-Home-Screen walkthrough. Phones (below `md`) keep the bottom tab bar, cards, swipe and sheets exactly as in `design-system.md`; nothing here changes them except the cover placeholder (section 6) and the Install row in Settings (section 10). Reuses `frontend/src/theme.css` as is: **no new colour, type, radius or shadow tokens** (the only new value is `--column-w: 64rem` for the table screens, an existing variable). Shipped reference for the reminders part: `reminders.md` sections 1-2 and `RemindersTable.tsx`; where this file differs, this file wins (listed in section 7).

Owner decisions taken as given: one sidebar section "Media" with Books / Movies; table with thumbnails; one table family for the four entities.

## 1. Four widths

Sidebar is 14rem (224px). The scroll area is the viewport minus the sidebar. Tables sit in a column capped at `--column-w` = 64rem (1024px), centered, with the 16px page gutter inside it. Add, detail and every dialog keep their own widths. Settings keeps 36rem below `md` and takes 56rem from `md` (section 15, which supersedes "Settings stays 36rem" in sections 7 and 10).

| Viewport | Scroll area | Table width | Books columns | Movies columns | Subscriptions / Licenses |
|---|---|---|---|---|---|
| 768 (iPad portrait, small window) | 544 | 512 | Title (author under it), Year, Status, heart, delete | Title (series line under it), Year, Status, heart, delete | Name, Expires, Renewal, delete |
| 1024 | 800 | 768 | + Author, Rating | + Rating | + Cost |
| 1440 | 1216 | 992 (column 1024, 96px margin each side) | same as 1024, + Updated | + Updated | same as 1024 |
| 1920 | 1696 | 992 (column 1024, 336px margin each side) | same as 1440 | same as 1440 | same as 1440 |

Rules behind it: a column that does not fit is hidden with CSS (`hidden lg:table-cell`, `hidden xl:table-cell`), never squeezed; the Title column always has at least 200px at `lg` and 160px at `md`; nothing is hidden by JS. 1920 is deliberately not stretched: past 64rem the eye travels too far from the name to the status and delete columns. Check list for the frontend-dev: Russian at 768 (status badge "Запланировано" is the widest cell, about 120px with padding) and 1024 (Books: Author capped at `max-w-40` so Title keeps 200px).

## 2. Sidebar (from `md`)

```
 [shelf]  Media          <- parent: goes to the last used of Books / Movies (default Books)
          Books
          Movies
 [bell]   Reminders
          Subscriptions
          Licenses
 [gear]   Settings
```

- Three parents, always expanded (never an accordion: one click reaches any list, which is better than the two-tap rule). Sub-items sit under the parent with the existing `pl-9` indent and the same markup as the Reminders sub-list: `<ul aria-label="Media">`, `aria-current="true"` on the active sub-item, `aria-current="page"` on the parent when its section is current. Current parent and current sub-item both get `bg-accent-soft text-accent font-semibold` (as Reminders today).
- The routes stay `#/books` and `#/movies` (the phone tab ids). "Media" has no route of its own: its button opens the last used media tab. "Last used" is in memory, initialised from the launch tab if that is books or movies, else Books (no new storage).
- Sub-items are 44px high (was 36 on the Reminders sub-items): iPad portrait is >= `md` and touch. Gap between sub-items 2px. Total sidebar height is about 400px, fits a 768px-high window.
- New icon: one "shelf" glyph for Media (three upright books, same 24px stroke style as `BookIcon`/`FilmIcon`). It is the only new icon besides the share, add-to-home and GitHub glyphs in sections 9-10.
- Labels (new key `nav.media`; the sub-items reuse `nav.books`, `nav.movies`):

| Key | en | ru | uk |
|---|---|---|---|
| `nav.media` | Media | Медиа | Медіа |
| `nav.books` | Books | Книги | Книги |
| `nav.movies` | Movies | Фильмы | Фільми |

  "Movies" keeps covering series. All labels fit the 200px row with room (`truncate` stays as the fallback).
- Tapping the current parent or sub-item scrolls the region to the top (existing behaviour). The phone tab bar is unchanged: four tabs, no "Media".
- Page title on wide screens is the section name: `Books` / `Movies` / `Subscriptions` / `Licenses` (the sidebar shows the parent already).

## 3. The shared table (one family)

One generic component replaces `RemindersTable`'s markup. Looks and behaviour are identical for the four entities; only columns and cell content differ.

```
+--------------------------------------------------------------------------------+
| Title ^           Author     Year   Rating  Status    (heart)  (trash sr)       |  <- sticky header, 44px
+--------------------------------------------------------------------------------+
| [img] Dune        Frank H.   1965   * 4.3   [v Read]    heart     trash          |  <- row 64px (text-only rows: 44px)
|       (2 lines max)                                                              |
| [img] ...                                                                        |
+--------------------------------------------------------------------------------+
```

**Container.** `bg-surface rounded-card`, `w-full`, `border-separate border-spacing-0`, no outer border, no shadow (flat like cards). The last row has no hairline. No `overflow-hidden` on the card (it would break the sticky header): the first and last header cells and the last row's first and last cells carry the corner radius.

**Header.** One row, sticky at `top-0` of the scroll region, `bg-surface`, 0.5px `separator` under it. Each sortable header is a `<button>` (`min-h-11 w-full px-3 text-left whitespace-nowrap text-foot font-semibold`) inside `<th scope="col" aria-sort>`; `text-ink-2`, `text-ink` while it is the sort column; the sort glyph (`ColumnSortIcon`) always occupies its slot so the header does not shift. Click cycles: first direction -> opposite -> back to the default order. The first direction is per column: text columns, Status and Renewal start ascending; Year, Rating, Favorite, Updated start descending (best/newest first); Expires starts ascending (soonest). A missing value is always last, whatever the direction. The default order is the incoming one (Books/Movies: Title A-Z; reminders: expiry soonest first). Sort is transient view state (not stored, not shared with the phone's stored sort), as shipped for Reminders. Icon-only columns have a text name for assistive tech: heart header = `<button>` with the heart glyph plus `sr-only` "Favorite" (sortable, favorites first); the delete column header is `<span class="sr-only">Delete</span>` (not sortable).

**Cells.** `px-3 py-2 text-body`. Name cell: `text-ink font-semibold`, takes all remaining width (`w-full min-w-0`), wraps to 2 lines (`line-clamp-2 [overflow-wrap:anywhere]`). Value cells: `whitespace-nowrap text-ink-2`, numbers `tabular-nums`; Author is the single free-text value column and truncates (`max-w-40 truncate`, full text in the detail). Icon columns are 3rem wide and centered, buttons 44x44. Missing value: em dash with `sr-only` text ("No rating", "No author"), never "N/A" in a table.

**Rows.** Whole row opens the detail dialog (`cursor-pointer`), but the keyboard and assistive-tech target is the name button inside the Name cell. The row click is ignored when the user is selecting text (`getSelection()` not empty). Row fill: `hover:bg-surface-2` (Tailwind's `hover:` is already pointer-only), `active:bg-surface-2` for touch. Status, heart and delete buttons stop propagation. Leaving rows (a status toggle that the active filter hides) fade 220ms (opacity only, no height collapse in a table), then are removed; none under reduced motion.

**Density.** One density: rows with a thumbnail are 64px (thumb 42x56 plus 4px), text-only rows 44px (the 44px button sets the height). No compact toggle.

**Keyboard and focus.**
- Tab order: sidebar, page header (Add), toolbar, column headers, then per row: name button, status, heart, delete. Header and name buttons activate with Enter/Space.
- ArrowDown / ArrowUp on a name button moves focus to the name button of the next / previous row (a few lines; no `role="grid"`, no roving tabindex, so plain Tab still works). Home/End are not handled.
- Focus ring: the global 2px accent `:focus-visible` ring, drawn inset (`outline-offset: -2px`) on header and name buttons so it is not clipped by the card. This deliberately differs from the card rule ("no ring on the open area"): in a dense table the ring is the only position cue for keyboard users, and pointer users never see it (a mouse click does not match `:focus-visible`; `focusQuietly` still handles focus the app moves itself). If the owner wants the card rule here too, remove the exception in one class.
- Dialog opened from a row returns focus to that row's name button. After a confirmed delete focus goes to the name button of the row that took its place (else the previous row, else the Add button, else the empty-state button).
- Escape closes dialogs (existing). No global shortcuts.

**Dark mode.** Tokens only. Thumbnails carry a 0.5px `separator` inset ring so white covers do not bleed into `surface` in light and dark covers do not vanish in dark.

**What to generalize from `RemindersTable.tsx` (into `components/DataTable.tsx`)**
- Take over: the sort state machine and comparator (collator, missing-last), extended by `first: 'asc' | 'desc'` per column; the `<thead>` with header buttons, `aria-sort`, `ColumnSortIcon`, sticky and the inset ring; row click with the selection guard; the trailing delete cell and its `aria-label` (`media.deleteItem`); arrow-key row navigation; corner handling; the row fade (`leaving` ids); `hideBelow: 'lg' | 'xl'` per column; a `loading` mode that renders skeleton rows (section 8); the `useWide()` hook (move out of `RemindersScreen.tsx` to a shared file, used by all list screens).
- Column definition: `{ key, header, srHeader?, sort?: (row) => string | number | null | undefined, first?, hideBelow?, align?, nowrap?, cell(row) }`. The Name column is declared separately: `{ lead?: ReactNode (the thumbnail, outside the button), title: string, sub?: ReactNode }`; the table wraps title and sub in the open button.
- Leave in the features: the cell renderers (urgency badge with date, renewal text, cost; media status/heart buttons, rating, author), the sort-value functions, texts, thumbnails, add/delete/detail orchestration. No virtualization, selection, column resize or column picker.

## 4. Media tables

### Books

| Column | Shows | Sortable | Visible |
|---|---|---|---|
| Title | thumbnail 42x56, title (2 lines), under it: author (below `lg` only), `Draft` neutral chip for drafts, pending-sync dot (Phase 10) | yes, A-Z first (default order, collator) | always |
| Author | author or em dash, truncated | yes, A-Z | `lg` |
| Year | year or em dash | yes, newest first | always |
| Rating | star + value (`4.3`), em dash if none | yes, highest first | `lg` |
| Status | status badge button (below) | yes, Planned before Read first | always |
| Favorite | heart button | yes, favorites first | always |
| Updated | `20 Nov 2026` (`Intl`, user's saved timezone) | yes, newest first | `xl` |
| (delete) | trash button | no | always |

### Movies

Same, minus Author. The type is not a column: the orange (grey for drafts) type icon, 16px, sits before the title (film or TV glyph, `sr-only` "Movie" / "Series"), as on the card. The line under the title is the series line (`Status: Ended • 3 seasons`, one line, truncated) for series; movies have no second line except chips. Movies has no Author column, so at `lg` it simply has more room for Title.

### Status, favorite, rating, type in a row

- **Status** is a button whose content is the compact badge (16px pill, 10px icon, 10/500 text, planned/seen pairs: the same size as the Reminders urgency badge, so every row badge in the app is one size). It toggles Planned/Seen with the same optimistic behaviour as the card's eye. Accessible name is the badge text followed by a visually hidden action, for example "Planned, mark as read" (`media.status.planned` + `media.markSeen`), so the visible label is contained in the name. The button hit area is 44px high and `badge + 24px` wide. This replaces the card's eye: a separate eye column would cost 52px that does not exist at 768 and would repeat the badge.
- **Favorite** is the same heart button as the card (`text-fav` filled when on, `text-ink-2` outline when off; shape differs, so never colour only), with the existing labels.
- **Rating**: star (`text-star`) then number, `tabular-nums`; the existing `Intl.NumberFormat` with one decimal and the `aria-label` pattern `media.rating`.
- **Source badge** (Open Library, TMDb) is dropped from rows: it is in the detail dialog. Only `Draft` is shown, because drafts have a filter and no cover.
- Delete is the trailing `text-danger` trash button; it opens the existing `ConfirmDialog` (waits for the server, no Undo).

## 5. Top bar of the media list (wide)

```
Books  12 of 45                                                    [ + Add ]
[ (o) Search books_________ ]  [ All | Movies | Series ]   [ Filters (1) ] [ ... ]
+- table ---------------------------------------------------------------------+
```

- **Row 1, page header** (`pt-2 pb-4`, 44px high, items centered): `h1` section title (no count on wide screens, owner decision 2026-11-20; phones keep it; the row is a fixed `h-11`, so removing the count changes nothing in the height); at the far right the **Add** button.
- **Row 2, toolbar** (`flex h-14 items-center gap-2 pb-3`, one line and the same height on Books and Movies, not sticky: the table header is the sticky element, see section 3; clicking the current sidebar entry returns to the top): search field (`min-w-0 flex-1 max-w-sm`, 44px, unchanged component, same label and `type=search`); on Movies the All / Movies / Series segments (existing `Segments`, fixed `w-[17rem]` so it does not stretch; shown only when both types exist or a type is selected, as on the phone; tapping the selected one returns to All); then `ml-auto` the Filters button; on Movies the More button. The row never wraps (the search field shrinks), so the distance between the title and the search row is identical on both lists.
- **Filters button**: icon + the word "Filters" (`media.filter.open`; ru Фильтры, uk Фільтри) + the numeric badge, `min-h-11 px-3 rounded-md`, same active look (`bg-accent-soft text-accent`) as the phone button. The text is shown on wide screens because the bar has room and a labelled control needs no tooltip. The default state (seen hidden) still counts as 1. The dialog is the unchanged filter dialog (tri-state rows, live `Show 6 of 8`), which is a centered dialog from `md` already.
- **Sort button and sort sheet are removed on wide screens** (the headers sort). Phone unchanged.
- **More** (Movies only) stays an icon button (44, `aria-label` "More", `title` too) that opens the same sheet with "Refresh series status".
- **Count**: none on wide screens (owner decision 2026-11-20, overriding the earlier "kept because the default filter hides Seen items"; the Filters button badge shows that a filter is active). Phones keep the count.
- **Search** stays: it is the fastest way to find an item in a long list and costs one field; sorting columns does not replace it. Search is on-list (title substring, as today), device-local like the filters.
- **Filters** stay as the existing dialog rather than per-column filter popovers: the criteria (favorite, seen, draft, ended) are tri-state and few, the dialog is already built and tested, and column menus would be a new component with its own keyboard model for a rarely used action. Dropped on wide screens: the standalone Sort control only.
- **Filter state** is the same device-local stored state as the phone (same device, just a wider window), so the default "seen hidden" applies; the **sort** is not (see section 3).
- **Add** (the FAB is not shown from `md` up, on all three list screens): a primary button at the right of row 1, `bg-accent text-on-accent min-h-11 px-4 rounded-md font-semibold`, plus icon then the word "Add" (`media.add`; ru Добавить, uk Додати); the `aria-label` is the longer existing label (`Add a book`, `Add a movie or series`, `Add subscription`, `Add license`), which contains the visible word. Visible only when the list is loaded and has at least one item; in the empty state the state's own button is the only add control (rule shared with Reminders). Reason: a bottom-right FAB floats over the trailing delete column of the table and has no meaning for a mouse user; a labelled button at the top is where desktop users look. Focus returns to it after the Add dialog closes.

## 6. Thumbnails and placeholders

**Thumbnail**: 42x56 (3:4 as the card cover), `rounded-sm`, `object-cover`, `loading="lazy"`, `decoding="async"`, fixed size so rows never shift, inset hairline ring. It is not a link (cards link the cover to the source page; in the table the row opens the detail, which has "Open source page"; two targets in one dense row would be worse). `alt=""` (decorative; the title is the name).

**Placeholder** (no cover, a broken image, or a draft): the iOS `draft_book` image for books, `draft_movie` for both movies and series, light (`-w`) or dark (`-d`) chosen by `prefers-color-scheme` with one `<picture><source media="(prefers-color-scheme: dark)">`. Ship only the `2x` files (four PNGs in `frontend/src/assets/covers/`, cached by the service worker): the art is a flat illustration on a full tile, 160 x 216 px at `2x` (verify on import), enough for 42x56 (thumb), 80x108 (card), 104x140 (detail) and 60x80 (add-sheet results) even at 3x without visible blur. The tile is clipped by the same `rounded-sm` and carries the same ring. It replaces the generic 32px book/film icon everywhere a cover can be missing (cards, detail dialog, add results, tables). The small orange/grey type icon next to the title stays: grey = draft. One component, `Cover({ src, kind, width, height })` (name and the four `2x` PNGs confirmed by the owner), owns img, error fallback and placeholder; `CoverLink` (cards, detail) wraps it in the link.

**No hover poster** (owner decision 2026-11-20): at this row height the thumbnail is already readable, and the detail dialog shows the cover larger.

**Fixed row geometry** (owner decision 2026-11-20): every media row is exactly 72px high (thumbnail 42x56 plus 8px above and below), whatever the row holds. The thumbnail box is the same for real images and the placeholder: `Cover` sets its pixel size inline (the Tailwind `h-auto` image reset would otherwise let the placeholder keep its natural ratio) and `object-cover` crops external images. The title is clamped to two lines; the second line (author below `lg`, series line) and the Draft chip sit under it, and the name button clips what does not fit instead of growing the row. Skeleton rows have the same height.

**Fixed column widths**: the table is `table-fixed`; every column but Name has a width class (media: Author 11rem, Year 5rem (from lg), Rating 6rem, Status 9rem, Favorite 3.5rem, Updated 9rem; reminders: Expires 16rem, Renewal 9rem, Cost 7rem; delete 3.5rem), Name takes the rest, and text cells truncate with an ellipsis. Subscriptions and licenses therefore render identical columns whatever their content. Columns still hide by breakpoint (`hideBelow`).

## 7. Reminders table, changed to match the family

- Same component, same header and row rules. Columns Name, Expires (date left, urgency badge right), Renewal, Cost, delete; **Renewal and Cost are hidden below `lg`** (owner: sacrifice Renewal first; with all columns Name shrank to about 90px on narrow windows); both stay in the detail dialog.
- Content width 64rem (was 60rem), set once for books, movies and reminders in `AppShell` (`md:[--column-w:64rem]` for those three tabs; Settings gets `md:[--column-w:56rem]`, section 15).
- The wide FAB is replaced by the header Add button (section 5), shown while the list is loaded and non-empty. The old `md:right-[calc(...)]` FAB offset formula can be deleted from the three screens and `index.css` keeps `--column-w` only for the width.
- Title row: unchanged (section name, no count, no segments, no filter, wide).
- Text-only rows stay 44px high.

## 8. States in table form

| State | Treatment (wide) |
|---|---|
| Empty (total 0) | No toolbar, no table, no header Add. Centered state in the content column (`py-24`): `text-draft` icon, headline, one-line prompt, accent button (existing strings). |
| No match | Header and toolbar stay ; the table is replaced by the existing "Nothing matches" state with Reset (clears search and filter). |
| Loading | Header row and toolbar visible, no Add. The table shows its real header (buttons `disabled`, labels kept so nothing jumps) and 6 skeleton rows with the same geometry as real rows: thumb block 42x56 (media only, 72px rows) and two bars, value-column bars; `animate-pulse`, none under reduced motion; `aria-busy` on the section and `role="status"` with the existing loading label. |
| Load error | No toolbar, no Add. State in place of the table: message, `Retry` (44px). Media adopts the Reminders wording split: online "Could not load. Retry." vs `*.loadError.offline` "You are offline. Check the connection and retry." (media currently has only the first). |
| Offline (Phase 5 service worker serves the shell and images; data cache is Phase 10) | Until the cache exists, offline equals Load error above. With the cache (Phase 10): an amber banner above the toolbar, full table width, `rounded-md`, same banner component as the phone ("You are offline" + reassurance); table and Add stay usable. |
| Sync pending (Phase 10) | Blue banner with spinner above the toolbar; rows with queued changes show a 8px `warn` dot after the title (with `sr-only` "Not synced yet"), in the Title cell's second line. |
| Sync error (Phase 10) | Red banner `N changes could not sync` + Retry (44px) above the toolbar; affected rows show the same dot in `danger` with `sr-only` "Not synced". |
| Mutation failure | Existing toast, centered on the content column. A failed delete keeps the row. |
| Push denied | Not a list state: Settings row chip "Blocked" (design-system section 3). Hidden here. |

## 9. Detail dialog at desktop width

Already a centered dialog from `md` (`max-w-lg`, max 85dvh, own scroll, footer pinned). No layout change for media detail, reminder detail, add/edit, filter, More and ConfirmDialog. Differences that matter with a table behind it:
- It opens from the row (click on the row or Enter on the name button); focus returns to the row's name button on close; the table behind is `inert` while any dialog is open (as the cards are today).
- The delete button in the detail and the row's trash button both lead to the same `ConfirmDialog`, which stacks above the detail (existing inert stacking).
- The cover in the media detail uses the same `Cover` component: real image or the iOS placeholder (104x140).
- The Add dialog stays 85dvh high on wide screens; results rows keep the 60x80 cover (placeholder art, section 6).

## 10. Signed-out screen (the app shell without access)

Owner idea (2026-11-20), replacing the standalone sign-in page: when signed out the app looks like the app, with a locked main panel. No mock or dev login, no email form, one action. The device locale applies (no language switcher: the locale is fixed at sign-up and changeable in Settings later).

```
phone (390): panel only             desktop (1440)
+-----------------------+           +----------+-------------------------------+
|                       |           | (dimmed) |                               |
|                       |           | Media    |         [icon 192]            |
|     [icon 160]        |           |  Books   |   Sign in to get access.      |
|                       |           |  Movies  |   [(gh) Sign in with GitHub ] |
|  Sign in to get       |           | Reminders|   First time here? ...        |
|  access.              |           |  ...     |   Install the app             |
| [(gh) Sign in with    |           | Settings |                               |
|        GitHub]        |           +----------+-------------------------------+
|  First time ...       |            sidebar: aria-hidden + inert, no <nav>
|     Install the app   |
+-----------------------+
```

Honest opinion on the idea: it is sound from `md` up and a poor fit on phones; do it with the rules below. It removes a screen and a card, gives the user the same spatial frame before and after sign-in, and costs almost nothing because the sidebar already exists. The pitfalls, and how this spec closes them:
- **Accessibility**: a dimmed sidebar must not read as navigation. It is rendered as decoration only: no `<nav>`, no buttons or links, `aria-hidden="true"` and `inert` (not focusable, not announced, not clickable), labels shown at 40% opacity. Screen-reader and keyboard users meet only `main` with the heading and the button. Dimmed text is exempt from AA contrast as an inactive, non-interactive decoration, but it must not carry meaning.
- **Phones**: no tab bar. Four dead tabs would mislead (they look tappable, and iOS users have no hover to learn otherwise), and they would cost 56px plus the bottom inset for nothing. The phone shows the panel alone, centered. The shell-as-signal argument only holds where the sidebar is a calm side element, which is `md` up.
- **Deep link while signed out** (`#/movies`, `#/reminders/licenses`): the hash is left untouched and ignored (no redirect, no rewrite, the tab memory is not written). It does not survive the GitHub round trip (the callback returns to the site root), so after sign-in the stored last tab applies. Restoring the hash would need a pre-login `sessionStorage` entry; not worth it for Phase 5. Reminder notifications (Phase 9) open a deep link in the installed app, where the session normally exists.
- **Flash of shell before `/me` resolves**: the shell, including the dimmed sidebar, appears only after `/me` answers 401. While `/me` is pending the existing splash stays (same background). The splash uses the same icon at the same size and centered position as the panel, so splash to signed-out panel only adds the text and button below the icon (no jump), and splash to the real shell for signed-in users never shows a ghost sidebar.
- **Installed iOS app**: it has its own cookie jar, so a user who signed in in Safari must sign in again in the installed app; the signed-out panel keeps the Install link and the note in section 11 for that reason, and the OAuth return into the standalone app is one of the post-deploy iPhone checks in `TODO.md`.
- Recommendation: build exactly this (panel plus decorative sidebar from `md`, panel only below it). Do not build a "preview" of real content or a dead tab bar.

- **Layout**: the panel is the shell's main area: `min-h-dvh`, content centered both ways in a column `max-w-sm` (24rem), safe-area paddings kept (`pt-safe pb-safe px-safe`); from `md` the area is the viewport minus the 14rem decorative sidebar (same widths and borders as the real one, so the layout does not move after sign-in). No card on either size: the panel is flat on `bg`.
- **Icon**: the iOS app icon artwork (architect's asset, the same file family as the manifest icons), a decorative `<img alt="">` 160px on phones, 192px from `md`, centered, with the tile's own rounded corners, no shadow, no text wordmark next to it (the artwork carries the name; the page has a visually hidden `h1` "RWX"). The loading splash uses this same icon at the same size and position with a spinner under it (replaces the bare "RWX" text in `App.tsx`).
- **Line**: one short line under the icon, `text-sheet font-semibold` centered, wraps: `login.required` en "Sign in to get access." ru "Войдите, чтобы получить доступ." uk "Увійдіть, щоб отримати доступ." (replaces the tagline).
- **Button**: full width of the column (on phones the width of the panel column, which is the screen minus the gutters), `min-h-12` (48), `rounded-md`, `bg-ink text-bg` (neutral and recognisable as the GitHub button; contrast about 16:1 in light and dark; accent orange stays the in-app action colour), the GitHub mark (20px inline SVG, `currentColor`, `aria-hidden`) + `login.signIn` ("Sign in with GitHub" / "Войти через GitHub" / "Увійти через GitHub"). It is a plain `<a href="/oauth2/authorization/github">`, unchanged. Focus: global ring. A long ru/uk label wraps (`min-height`, never fixed).
- **Note** under it, `text-foot text-ink-2`: `login.note` en "First time here? Signing in creates your account. RWX uses GitHub only to sign you in." ru "Впервые здесь? Вход создаст аккаунт. RWX использует GitHub только для входа." uk "Вперше тут? Вхід створить обліковий запис. RWX використовує GitHub лише для входу." (the second sentence must match the OAuth scopes, see open question 5).
- **Install link** (section 11): a text button `text-accent text-body min-h-11` "Install the app", shown only where install is possible and the app is not installed. Reason it is here: on iOS the installed app has its own cookie jar, so users who sign in in Safari first must sign in again; installing before signing in avoids that.
- **States**: *error* (`?error`): the existing `role=alert` `danger-bg` / `danger` box above the button, `login.error`. *Offline* (`navigator.onLine` false): a `warn-bg` / `warn` notice "You are offline. Connect to sign in." (`login.offline`; ru "Вы не в сети. Подключитесь, чтобы войти."; uk "Ви не в мережі. Підключіться, щоб увійти.") and the button `aria-disabled` at 60% opacity. *Redirecting*: after the click the glyph is replaced by a 18px spinner and the button is `aria-disabled` (prevents double clicks); restored on `pageshow` (Back from bfcache). *Loading* (the `/me` check): the splash (icon + spinner, above). *Server unreachable* (`/me` fails, not 401): the existing "Can't reach the server" + Retry in the same panel, without the sidebar decoration. Empty, sync and push states do not apply.
- **Dark and light**: tokens only; the decorative sidebar uses `surface` and `ink-2` at reduced opacity, the icon artwork is the architect's variant for dark if one exists, otherwise the same file.
- **Strings**: `login.tagline` is replaced by `login.required`; `login.signIn`, `login.error`, `login.note`, `login.offline` stay.

## 11. Install walkthrough

Where it appears (nowhere else, no banners, no popups, no nagging):
1. **Settings**, a new one-row group "App" between Language/timezone and Account data, only when the app is not running standalone (`display-mode: standalone` / `navigator.standalone` false) and install is possible. Row title and tap result by platform:
   - iOS or iPadOS Safari (no `beforeinstallprompt`): "Add to Home Screen" opens the walkthrough dialog.
   - Chrome, Edge, Android Chrome with a captured `beforeinstallprompt`: "Install app"; the tap calls `prompt()` directly (no dialog). If the user dismisses, the browser will not allow a second prompt in the session, so the row is hidden; it is also hidden on `appinstalled`.
   - Any other browser: the row is not shown (no instructions we cannot verify).
   Row subtitle (`text-foot text-ink-2`, wraps): "Opens full screen like an app. On iPhone, reminder notifications need it." (ru "Открывается на весь экран как приложение. На iPhone уведомления о напоминаниях работают только так."; uk "Відкривається на весь екран як застосунок. На iPhone сповіщення про нагадування працюють лише так.").
2. **Signed-out panel**: the same text button, same platform logic. This Settings "App" group plus Sheet walkthrough is the only install UI (decided by the owner; the architect's pwa-install design points here).
3. **Notifications row in Settings** (Phase 9): the "Not installed" state's action opens this same dialog (already specified in `design-system.md`).

**Dialog** (the `Sheet` component: bottom sheet on phones, centered dialog from `md`; content height; header Close/Done as every sheet): title "Add RWX to your Home Screen" (ru "Добавьте RWX на экран «Домой»", uk "Додайте RWX на екран «Додому»"; wraps to 2 lines). Body is an `<ol>` of three steps, each row: a 28px number disc (`bg-accent-soft text-accent`, `text-chip font-semibold`), the text (`text-body`, wraps), and a 24px glyph at the right in `text-accent` (Share square-and-arrow, plus-in-square, check), `aria-hidden`. No screenshots (they drift with iOS versions and cost localisation).

| Step | en | ru | uk |
|---|---|---|---|
| 1 | Tap the Share button in the browser toolbar. | Нажмите кнопку «Поделиться» на панели браузера. | Натисніть кнопку «Поділитися» на панелі браузера. |
| 2 | Scroll down and tap Add to Home Screen. | Прокрутите вниз и нажмите «На экран „Домой“». | Прокрутіть вниз і натисніть «На екран „Додому“». |
| 3 | Tap Add, then open RWX from your Home Screen. | Нажмите «Добавить», затем откройте RWX с экрана «Домой». | Натисніть «Додати», потім відкрийте RWX з екрана «Додому». |

Under the list, `text-foot text-ink-2`: "The app keeps its own sign-in, so sign in again the first time you open it." (ru "У приложения свой вход: при первом запуске войдите снова."; uk "У застосунку свій вхід: під час першого запуску увійдіть знову."). Footer: one `Done` button (`Готово` / `Готово`). The iOS menu names in step 2 and 3 must be copied from a real device in each language before release (marked in the task).

States: nothing loads, so empty/loading/offline/sync/push-denied do not apply; the dialog works offline (strings are bundled). Dark and light: tokens only.

## 12. Strings added (en / ru / uk)

`nav.media` (above); `media.col.title` Title / Название / Назва; `media.col.author` Author / Автор / Автор; `media.col.year` Year / Год / Рік; `media.col.rating` Rating / Рейтинг / Рейтинг; `media.col.status` Status / Статус / Статус; `media.col.updated` Updated / Изменено / Змінено; `media.noRating.sr` No rating / Нет рейтинга / Немає рейтингу; `media.loadError.offline` (copy of `reminders.loadError.offline`); `login.required`, `login.note`, `login.offline` (above); `install.row.ios` Add to Home Screen / На экран «Домой» / На екран «Додому»; `install.row.prompt` Install app / Установить приложение / Встановити застосунок; `install.row.note`, `install.title`, `install.step1..3`, `install.note`, `install.done` (above). Reused: `media.add`, `media.filter.open`, `media.status.*`, `media.favorite`, `media.deleteItem`. Column headers must tolerate +30%: they are `nowrap` buttons, so the widest ru header (Рейтинг, Изменено) sets the column minimum; counted in the section 1 budget.

## 13. Open questions for the owner

1. Status on the media table is a toggle button on the badge and there is no separate eye column. Default: yes (saves a column at 768, keeps the "mark read" one click).
2. "Recently changed" survives only as the Updated column at 1280px and up; between 768 and 1279 there is no way to sort by it. Default: accept (it is mainly a phone need), the alternative is giving up the Rating column at `lg` to fit Updated.
3. Table name buttons show the keyboard focus ring, unlike cards. Default: ring on (keyboard only).
4. The FAB is replaced by the header Add button from `md` up, on Reminders too. Default: yes.
5. The sign-in note claims GitHub is used only to sign in. Confirm the OAuth scopes (assumed read-only profile and email); otherwise drop the second sentence.
(Questions 1-4 and 6 are unanswered by the owner; the defaults stand.)
6. Sidebar label "Медиа" / "Медіа" for the group. Default: as written; "Медиатека" is nicer but longer.

## 14. Suggested tasks for the frontend-dev (one run each, in order)

1. **Sidebar Media group**: `AppShell` sidebar from a small structure (parent, children), `nav.media`, shelf icon, last-used media tab memory, 44px sub-items (also Reminders), `--column-w` 64rem for books/movies/reminders on `md`; i18n en/ru/uk; tests for routing and `aria-current`.
2. **`DataTable` extraction**: move the generic table out of `RemindersTable` (section 3), `useWide()` to a shared file, per-column first direction, `hideBelow`, arrow-key navigation, selection guard, skeleton mode, corner/sticky rules; Reminders re-pointed (Cost hidden below `lg`), header Add button replacing the wide FAB on Reminders; update its tests.
3. **`Cover` component and placeholders**: the four `2x` PNGs, `<picture>` dark/light, ring, broken-image fallback, used by cards, detail, add results; `CoverLink` wraps it. Visible on phones too.
4. **Media table**: `BooksTable` / `MoviesTable` column sets (section 4), status and heart buttons, Title cell with thumb and second line, wide branch of `ListScreen` (page header with Add, toolbar, no Sort, FAB hidden from `md`), the states of section 8, focus after delete, row fade; tests at jsdom (`matchMedia` mocked).
5. ~~Hover poster~~: dropped (owner decision 2026-11-20).
6. **Signed-out screen and splash** (needs the architect's icon): section 10, decorative inert sidebar from `md` (no tab bar on phones), GitHub mark, offline/redirecting states, `login.*` strings.
7. **Install**: `useInstall()` (standalone detection, iOS detection, `beforeinstallprompt` capture, `appinstalled`), the dialog, Settings "App" group, sign-in link; strings verified on a real iPhone in each language.
8. **Width and locale pass**: check 768 / 1024 / 1440 / 1920 in en, ru, uk, light and dark, keyboard walk-through (Tab, arrows, Escape), and fix overflow found; no new features.
(Settings is task 9, section 15.)

## 15. Settings at desktop width

Picture: `docs/design/prototypes/settings-desktop.html` (real tokens, sample sources: 3 books, 4 movies, mixed keys, two sources that need a key, one of them the default; `?lang=ru|uk`, `?theme=dark`, `?state=loading|error`; the Add/Replace key button opens the dialog). Phones (below `md`) are untouched. No new token, string or component except those listed in "Strings" below.

**Problem.** Today Settings is the phone column (36rem, centered, small-caps heading above each rounded list) on a 1216 / 1696px area: a narrow strip with 400-600px of nothing each side, label and control at opposite edges of a 36rem row, a key status that looks like plain text, and a select with no visible keyboard focus.

**Decisions**
1. **One column, not a grid, not master-detail.** Six groups, five of them one to three rows: a section index (master-detail) would be navigation for a page that fits in about 1.6 screens and costs a state machine, a route and a second scroll; a two-column grid puts the tall Sources group beside short ones and leaves holes. The scroll stays the index. (Rejected, with reason: owner's "no over-organization".)
2. **Width 56rem (896px), centered**: `md:[--column-w:56rem]` for the settings tab only, 16px gutter inside. Narrower than the 64rem table column on purpose: a settings row pairs a label with one control, and past about 900px the eye travels too far between them (the same argument as section 1). 1920 does not stretch (336+px margins each side, same as the tables).
3. **Headings stay above the card at every width** (`text-foot uppercase text-ink-2`, as on the phone). A heading rail was built and dropped (owner, 2026-11-20: too much empty space). The page title `h1` stays above.
4. **Card**: unchanged (`bg-surface rounded-card`, 0.5px hairlines). Rows are 48px, controls 44px; one density as everywhere. No shadow.
5. **Row grammar at `md`+** (all existing strings):
   - Select rows (Language, Timezone): label left, the value in secondary ink with a chevron, right aligned: exactly the phone row at every width (owner, 2026-11-20: the filled control touched the row borders and looked worse). **Focus**: no outline at any width (the orange border after a mouse pick looked wrong). Long timezone names truncate; the full value is in the open list.
   - Action rows (Sign out, Use device timezone, Keep UTC, Export, Delete account, Install): centered as on the phone (owner, 2026-11-20), full-row hit targets, same colours (accent, danger for Delete, ink for Sign out).
   - Account identity row: unchanged (avatar 44, name `break-words`).
6. **Sources: a row family aligned with the shared tables, minus sorting.** Per type a sub-heading line (`text-foot font-semibold text-ink-2`, existing `sources.books` / `sources.movies`), then one row per source, 52px min:

```
md and up: one line, name | state | key button
 Books
 (o) Open Library            (v) Available          (no key action)
 ( ) ISBNdb                  (!) Needs an API key   [ Save key    ]
 Movies and TV
 (o) TMDb                    (!) Needs an API key   [ Save key    ]
     Default . add a key or switch
```
   - **Columns** (CSS grid on the row, direct children, no table element): name `1fr`; state `9rem` and key action `3.5rem` from `md` (768), `10rem` and `3.5rem` from `lg`; the key action is a key icon button (aria-label and tooltip carry the Add/Replace key text). The normal state never wraps to a second line at `md`. The default-needs-key hint sits on the same line after the name from `md` (all rows keep one height, so the list does not jump when the default changes; it is a second line only on phones). Below `md` (phones) the row is the two-part phone row: name, then state and chevron as one tap target. Name wraps (`[overflow-wrap:anywhere]`), never truncates: a source label is the thing being chosen.
   - **Radio** stays the left element, 20px glyph in a 44px target as today; the default-source control still appears only when the type has 2+ sources. Do not draw a "Default" column header: the group's `aria-label` ("Default source for Books") carries it and a header would exist for one glyph. Make the radios native (`input type=radio`, visually restyled, one `name` per type): this gives Arrow-key movement inside a group and a single Tab stop for free, which the `role=radio` buttons do not have (every one is a Tab stop today and the arrows do nothing). Moving the radio selection saves immediately, as today (`busy` disables the group while saving).
   - **State** (text, not just colour): ready = seen-green + check glyph + "Available"; unavailable = danger + **new 16px alert-circle glyph** + "Needs an API key" (today colour and wording alone). A default that cannot be used keeps the warn second line "Default . add a key or switch" under the name.
   - **Key action on desktop is an explicit text button** (`text-accent font-semibold min-h-11 px-3 rounded-md hover:bg-surface-2`, label `sources.keySave` when none is saved, `sources.keyReplace` when saved; the phone keeps state plus chevron as one tap target). It opens the existing key dialog; Remove key stays inside the dialog (a destructive action is not exposed in the list). Sources without a key have no button (an empty reserved cell, so statuses align across rows).
   - **Unavailable**: nothing is greyed out or hidden; the row remains selectable as default (the server allows it and the hint explains), the key button is the way out. The accessible name of the key button includes the source: `aria-label` = "Save key, TMDb" (pattern `{action}, {source}`), because five identical "Save key" buttons are otherwise indistinguishable in a screen reader's button list.
   - **States**: loading = group card with the spinner row (as now); load error = message left, Retry text button right (44px) on one line; empty type = group not rendered (as now); `setDefault` failure = the existing danger strip inside the type block; offline = same as load error until the settings cache exists (Phase 10), key and default changes need the server and show their existing inline errors; sync-pending/sync-error: not applicable to Settings (server-only writes); push-denied: not a Sources state (Notifications row, Phase 9, same row grammar: label left, state chip, action right).
7. **Key dialog at desktop**: same `ConfirmDialog` (centered from `md`), width raised to `max-w-md` (28rem) for this dialog so the long placeholder "New key (replaces the saved one)" and the help link do not wrap; title, input, reserved error line, help link, Remove icon, Cancel and Save/Replace unchanged. Opens from the row's key button; **focus returns to that button on close** (today it returns to the opener only if the row is still mounted: the row stays mounted, so keep the ref and use `focusQuietly`). Escape cancels, Enter submits (existing). The page behind is `inert` (existing dialog behaviour).
8. **Focus order** (a plain tab walk): sidebar, then per group top to bottom; in Sources per type one stop on the radio group then per row the key button; Install and the delete dialog unchanged. Ring: global 2px accent; the card has `overflow-hidden`, which would clip it on full-row buttons, so those (action rows, install row) use the inset ring (`outline-offset: -2px`, as table buttons in section 3); selects, radios and the key button sit inside the row padding and keep the normal offset.
9. **Dark and light**: tokens only; the new surface fill is `surface-2` for selects (as the key input); hairlines `separator`; contrast as the existing pairs (accent on surface 4.9:1 light / 7+:1 dark in `design-system.md`; `seen`, `danger`, `warn` on `surface` are the same pairs the phone rows use).
10. **Languages**: headings sit above the card and wrap in the full width. Action labels ("Использовать часовой пояс устройства (Europe/Kyiv)") wrap in the full-width row; the select label `shrink-0` is at most "Часовой пояс" (about 110px) beside the value. Select values never wrap (truncate). Verify ru and uk at 768 and 1024.

**Strings**: none new. New glyph: alert-circle (inline SVG, same stroke style as the check). `aria-label` pattern for the key button is a new key `sources.keyAction` = "{action}, {source}" (ru "{action}, {source}", uk "{action}, {source}").

**Task 9 (one frontend-dev run, small)**: Settings desktop layout.
1. `AppShell`: `md:[--column-w:56rem]` for the settings tab (replace the current "settings has none" branch); check the page title and tab offsets are unaffected.
2. `SettingsGroup`: unchanged from the phone (heading above the card).
3. `SelectRow` from `md`: visible control (15.5), no outline at any width; action rows stay centered.
4. `SourcesSection`/`SourceRow`: grid row (15.6), native radios per type, alert-circle glyph, desktop key button (`hidden md:inline-flex`; the phone chevron button `md:hidden`; state rendered once), `sources.keyAction` strings, focus return from `KeyDialog`; `KeyDialog` `max-w-md` (add a `width` prop on `ConfirmDialog` only if it has none).
5. Tests: radio group keyboard (arrow selects and saves), key button accessible name, state glyph for unavailable, default hint; existing `SourcesSection` and `SettingsScreen` tests updated for the markup. Visual check 768 / 1024 / 1440 / 1920 in en, ru, uk, light and dark against the prototype.

**Open questions (defaults stand unless the owner says otherwise)**
1. Resolved 2026-11-20: no heading rail; headings above the cards at every width.
2. Sources: native radios and the explicit key button on desktop (default yes). The phone keeps chevron rows.
3. The sample set (3 books, 4 movies) is invented for the picture; the shipped registry decides the real rows. The layout is designed for 3+ per type and works with 2.
4. uk strings in the prototype were typed from `uk.ts` where the key exists and otherwise adapted from ru; translator review not needed because no new user-facing string except `sources.keyAction`.

# RWX design system

Scope: Books, Movies/TV, Add sheet, Filter/Sort sheets, Item detail, Settings. Reminders, sign-in and the install walkthrough page are not designed yet (the install steps exist as a short inline list in Settings).

Principles: minimal; two taps to any list (tab bar: Books, Movies, Reminders, Settings); no categories, tags, ads or recommendations; fast capture (the "+" is a thumb-reach button on every list, the add sheet opens with the keyboard up); drafts always possible, even offline or without a search provider.

Prototypes: `docs/design/prototypes/index.html` (links to every screen/state in light, dark, ru, uk). Single file `app.html`, no build step, no network. State is in the URL hash, e.g. `app.html?theme=dark&lang=ru#books~offline/filters`. It links the colour tokens from `frontend/src/theme.css` and uses hand-written CSS rather than the Tailwind CDN, so it works offline; class names are not meant to be reused, tokens are.

## 1. Tokens

Light/dark follow `prefers-color-scheme` (no in-app toggle in production). Contrast (WCAG AA, computed against the surface the token sits on): body text >= 12:1, `text-2` >= 6:1, accent text >= 5:1, all badge pairs >= 5.4:1, input/tap-target glyphs and the star/tri-state outlines >= 3:1.

### Colors

Values live in `frontend/src/theme.css` (light and dark); this table is the role of each token. Names map to Tailwind as `bg-surface`, `text-ink`, `text-ink-2`, `bg-accent`, and so on (`ink`, not `text`, so `text-ink` does not collide with the font-size utilities).

| Token | Use |
|---|---|
| bg | page |
| surface | cards, grouped rows |
| surface-2 | inputs, neutral chips, segmented track |
| text (`ink`) | primary text |
| text-2 | secondary text (never lighter) |
| separator | hairlines |
| accent | brand orange: FAB, links, active tab, non-draft type icon |
| on-accent | text/icons on accent |
| accent-soft | active filter button fill |
| planned / planned-bg | "Planned" badge |
| seen / seen-bg | "Seen" badge, in-library tick |
| danger / danger-bg | delete, errors, sync error |
| warn / warn-bg | offline, token missing, pending dot |
| fav | filled heart |
| star | rating star |
| draft | grey type icon for drafts |

Status is never colour-only: every badge has an icon and text; tri-state has shape (empty / check / minus) plus a word.

### Typography
System font (SF on iOS). Dynamic Type is not available in PWAs, so sizes are fixed; inputs are >= 16px (prevents iOS zoom-on-focus).

| Token | Size / line | Weight | Use |
|---|---|---|---|
| title | 30/36 | 700 | list page title |
| sheet-title | 17/22 | 600 | sheet header |
| detail-title | 22/28 | 700 | detail sheet |
| body | 15/20 | 400/500 | rows, result titles (600) |
| input | 16/22 | 400 | all text fields |
| footnote | 13/18 | 400 | meta, author, helper text |
| chip | 12/16 | 500 | badges |
| tab | 11/12 | 400 | tab labels |

### Spacing, radii, elevation, motion
- Spacing: 4pt grid (4, 8, 12, 16, 24, 32). Page gutter 16. Card padding 10, card gap 10.
- Radii: sm 8 (cover, small controls), md 12 (inputs, groups, banners), card 16, sheet 24, pill 999.
- Elevation: flat by default (no card shadows). FAB: `0 6px 18px #0004`. Sheet: `0 -8px 30px #0003` over a scrim (40% light, 60% dark). Tab bar: translucent blur + 0.5px top hairline.
- Motion: tap feedback 120ms (icon scale .88), list removal 220ms (fade + scale .97), sheet 320ms `cubic-bezier(.32,.72,0,1)`, scrim 280ms. `prefers-reduced-motion`: all durations ~0.

### Implementation
`frontend/src/theme.css` holds the colour variables (with the dark `prefers-color-scheme` set), the Tailwind 4 `@theme` mapping for colours, type scale, radii, shadow and easing, and the safe-area utilities (`pt-safe`, `pb-safe`, `px-safe`). It is imported by `index.css`. Required in `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and `<meta name="color-scheme" content="light dark">`; manifest `display: standalone`.

## 2. iOS-native-feel rules
- Layout is `100dvh`, app shell does not scroll; one scroll region between top inset and tab bar. `overscroll-behavior: contain` so we do not fight iOS rubber-band or pull-to-refresh (series refresh is an explicit action, not pull).
- Safe areas: top padding `env(safe-area-inset-top)`; tab bar and sheet bottoms add `env(safe-area-inset-bottom)`. The FAB and toasts sit above the tab bar + inset.
- Every tappable element >= 44x44 CSS px hit area (cards' heart/eye are 44x54, banner Retry and toast Undo 44 high, icon buttons 44). Visual glyphs may be smaller than the hit area.
- No hover-only UI. Every secondary action has a visible path: swipe-to-delete is also in the detail sheet; long-press on the cover is the only "Copy link" path and is non-essential.
- No `:hover` styles; use `:active` (pressed fill) and `:focus-visible` (2px accent outline) for keyboard/switch users.
- Sheets: grabber, rounded 24 top corners, scrim tap closes, header has a text button (Close/Done) because swipe-down dismissal is not reliable in a PWA. Add sheet is full height; others are content height. Hash/route-backed so the Back gesture closes it.
- Bottom tab bar: 4 tabs, icon + label, current tab in accent. Tapping the current tab scrolls to top (frontend behaviour). Reminders tab is shown disabled in prototypes only.
- Tap targets that change data give immediate optimistic feedback; delete is immediate with a 4s Undo toast (spec: no confirmation).

## 3. Components

**List page**: large title + count label (`12 of 45`, or `45`; hidden when total = 0; `aria-live=polite`). Sticky row below: search field (44px) + filter button + sort button. Filter button: filled soft-orange with numeric badge when active; the default state (seen hidden) counts as 1. Movies adds a 3-segment control All / Movies / Series under the search row (a shortcut for the type filter; tapping the selected segment returns to All; the sheet therefore has no type row). FAB "+" bottom right.

**List card** (spec: cover 80x108): cover button (opens source page) | text area (opens detail) | heart + eye column.
- Text: type icon (orange; grey for drafts) + title (max 2 lines), year or em dash, star + rating or `N/A`, author or "No author", TV line `Status: Ended • 3 seasons`, badges.
- Badges: Planned (blue, clock) / Seen (green, check), source name (neutral), wrap to a second line when long.
- Swipe left reveals Delete (CSS scroll-snap; no JS). Seen items disappear from the default view with a 220ms fade.
- Pending-sync dot on a card is a small amber chip inside the badge row.

**Status badge**: 22px high pill, icon 12px + text 12px/500, colours from the planned/seen/danger/warn pairs.

**Tri-state filter row** (whole 52px row is the target): 28px box + label + word. States cycle Any -> Only -> Hide -> Any. Any = empty outline; Only = accent fill + check; Hide = danger fill + minus. `role=checkbox`, `aria-checked` false/true/mixed. "Ended" appears only when type = Series and resets to Any otherwise. Sheet header: Reset (left, returns to default = seen hidden), Done (right); primary footer button `Show 6 of 8` shows the live result count.

**Sort menu**: bottom sheet with two radio rows (Title A-Z, Recently changed), check on the active one. Same sheet pattern as filters, consistent with the rest of the app instead of a native popover.

**Search bars**: list search is on-list (title substring). Add-sheet search: text field, line "Searching in Open Library" (provider picker only when 2+ providers), hint `Type at least 3 characters` below 3, spinner while debouncing, max 10 results. Result row: cover 60x80, title, year/star/rating, author, tick on the right when already in library (row disabled). Below results (as soon as there is any text): "Can't find it?" + draft row `Add "text" as draft`.

**Sheet modal**: see section 2. **Item detail**: cover 104x140, title, meta, badges, full scrollable description, then pills Favorite / Seen / Open source page / Delete. Opens from a tap on the card text area even when there is no description (shows "No description.") because the actions live there; this deviates from the spec's "only when a description exists" and should be confirmed.

**States** (all in the prototypes)
| State | Treatment |
|---|---|
| Empty (total 0) | icon, headline, one-line prompt, primary "Add ..." button; no count |
| No match | search icon, "Nothing matches", secondary Reset button; count shows `0 of N` |
| Loading | 4 skeleton cards, `aria-busy`, no count |
| Offline | amber banner at top of list "You are offline" + reassurance; list stays usable; add sheet: search disabled, draft only |
| Sync pending | blue banner with spinner "Syncing 3 changes"; per-card amber dot |
| Sync error | red banner "2 changes could not sync" + Retry (44px) |
| Load error | full-area state with Retry |
| Search error | red toast inside the sheet, results cleared (spec: 3 s) |
| No TMDb key | add sheet explains and links to Settings; draft still works |
| Push denied | Settings row chip "Blocked" plus instructions for iOS Settings (the app cannot re-prompt) |
| Not installed | Settings explains push needs the Home Screen app (iOS 16.4+) and opens the 3 install steps |
| Token missing/invalid | chip amber "Key missing"; invalid key shows inline red message, nothing stored |

## 4. i18n overflow
- Russian runs ~30% longer; Ukrainian similar. Test with `?lang=ru` / `?lang=uk` in the prototype (strings are real translations at real length, e.g. "Запланировано", "Напоминания", "Не удалось синхронизировать").
- Tab labels: 11px, `text-overflow: ellipsis`, 4 tabs of ~97px fit "Напоминания"/"Нагадування" without truncation at 390px; do not add a 5th tab.
- Card text wraps; titles clamp at 2 lines with `overflow-wrap:anywhere`; author clamps at 1 line; badges wrap (`flex-wrap`), never shrink. Buttons grow in height (`min-height`, not fixed height); no fixed widths on text containers.
- Segmented control labels must fit ~110px at 14px ("Сериалы", "Фильмы" OK); truncate with ellipsis as the fallback. Sheet header side buttons have `min-width: 64px`, title is flexible.
- Count label `N of M` is `N из M` / `N з M`: keep it as one translatable pattern with placeholders, not concatenated parts. Plurals ("N seasons", "N changes") need ICU plural forms in ru/uk (3 forms); the prototype avoids this with `сезонов: N` and `изм.`, the app should use proper plurals.
- Dates and numbers via `Intl` with the device locale; sort via `Intl.Collator(locale)`.

## 5. Accessibility and PWA notes
- Contrast and hit areas: see section 1 and 2. Every input has a label; badges carry an aria label with their text; cover images have alt text.
- Keyboard: Tab reaches every control, Enter/Space activate, Escape closes a sheet. Focus is visible (`:focus-visible`, 2px accent outline).
- Headings keep a proper hierarchy; the list count is announced via `aria-live=polite`.
- iOS Home Screen: notch and home-indicator insets via `env(safe-area-inset-*)`. Notifications work only in the installed app (iOS 16.4+), have no action buttons, and a tap opens the reminder detail.
- Android and desktop: same layout; sheets may render as centred modals on wide screens.

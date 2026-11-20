# Reminders screens (Phase 4, task U1)

Subscriptions and licenses, online-first. Reuses the existing components (`Sheet`, `ConfirmDialog`, `Toast`, `SelectRow`, list page, card, tri-state row, filter sheet, swipe-to-delete) and the tokens in `frontend/src/theme.css`; nothing new visually except one shared segmented control (extracted from the former Movies `TypeSegments`). Rules: `docs/openspec/specs/reminders/spec.md` and `docs/openspec/changes/archive/reminders/design.md` section 8. Generic rules (safe areas, 44pt, focus, motion, sheets/dialogs from `md`) are in `design-system.md` and are not repeated.

Out of this phase, so not designed: notification hint/banner, push-denied, sync-pending, sync-error, offline cache (Phase 9, and the offline sync phase 10). Prototype HTML is not extended (the existing `app.html` keeps Reminders disabled); this spec is the reference.

## 1. Navigation and segmented control

- Tab bar stays four items: Books, Movies, Reminders, Settings. From `md` up (sidebar) the Reminders item carries two sub-items, Subscriptions and Licenses, and the segmented control is hidden there (owner decision after the first manual run); they set the same segment and route as the control and work from any tab. Phones keep the control.
- From `md` up the list is a table instead of cards (owner request after the first manual run): columns Name, Expires (the date at the left edge, the urgency badge at the right edge of the column), Renewal, Cost and a Delete button; the content column widens to 60rem. Headers are buttons with `aria-sort`: a click sorts ascending, the next descending, the third restores the default order (expiry soonest first); a missing value is always last; the sort is device-local view state and is not remembered. A row (or its name button) opens the detail sheet. On wide screens the page title is the section name (Subscriptions / Licenses; the sidebar already shows the section) with a gap below it, no count (it belongs to the filter), the segmented control and the filter button are gone (the table sorts; a filter chosen on a phone is not applied there). Value columns do not wrap (`whitespace-nowrap`), the name column takes the remaining width and wraps to two lines. Below `md` the cards and swipe-to-delete stay.
- Inside the Reminders tab, the same layout on phone and sidebar layouts (the 36rem column): title row (`Reminders` + count), then the sticky row below it with the segmented control (flex-1) and the filter button (44x44) to its right. No search and no sort (the spec has none; the order is fixed by expiry).
- Segmented control: a `role="group"` of two buttons with `aria-pressed` (same markup as the former `TypeSegments`: `bg-surface-2` track, `rounded-md`, 2px padding, selected segment `bg-surface text-ink shadow-sm font-semibold`, others `text-ink-2`, each `min-h-11 flex-1 truncate px-2 text-body`). Unlike the Movies control, tapping the selected segment does nothing (there is no "All"). Labels: Subscriptions / Licenses, ru Подписки / Лицензии, uk Підписки / Ліцензії; each segment is about 150px at 390px width after the 52px filter button, so even the longest label (Лицензии) fits at 15px; ellipsis is the fallback.
- Routes: `#/reminders/subscriptions`, `#/reminders/licenses`. A bare `#/reminders` (tab tap) resolves to the remembered segment (default Subscriptions, corrupt value gives Subscriptions) and the app writes the full route. Selecting a segment uses `replaceState` (it is a view mode: Back leaves the tab, not the previous segment); tab switches still push as today. Two taps to either list: tab, segment.
- Each segment keeps its own filter, count and scroll position; the screen of the other segment stays mounted like a tab pane.

## 2. List

Header: `Reminders` title, count right-aligned, `aria-live=polite`: `12 of 45` when narrowed by the filter, `45` otherwise, hidden when the segment's total is 0 (the media rule, per segment, one translatable pattern `{shown} of {total}`). The filter button is filled `accent-soft` with the numeric badge (1) when the expiring-soon filter is not Any, exactly as on Books.

Order: expiry soonest first, expired first, lifetime last, then name, then id. Urgency never groups the list.

### Card

Same card as media without cover and without the heart/eye column: `bg-surface rounded-card`, padding 10, gap 10 between cards, swipe left reveals Delete (the same scroll-snap pattern, which opens the ConfirmDialog; Delete is also in the detail sheet). The whole card body is one button (min 44 high) that opens the detail sheet, with no focus ring on it (owner decision for media cards).

Content, top to bottom:
1. Name, `text-body` 600, 2 lines max, `overflow-wrap:anywhere`.
2. Meta line `text-foot text-ink-2`: expiry date and pattern, for example `15 Apr 2026 · Monthly`; for lifetime only `Lifetime`. Date via `Intl.DateTimeFormat(locale, {dateStyle:'medium', timeZone:'UTC'})` on the `YYYY-MM-DD` value (UTC so the day never shifts). Cost, when present, is the end of the line after another `·`; the line wraps rather than truncates.
3. Badge row (`flex-wrap gap-1`): the urgency badge.

### Urgency badge

The `Status badge` of the design system (compact after owner review: 16px pill, 10px icon + 10/500 text, never colour alone; the same size in the list and the detail sheet). Days = expiry minus today in the user's saved timezone (Q14); no new tokens.

| State | When | Text | Colours | Icon |
|---|---|---|---|---|
| expired | days < 0 | `Expired` | solid `danger` fill, `on-accent` text | x in circle |
| critical | days 0..2 | `Today`, `1 day`, `2 days` | `danger-bg` / `danger` | clock with alert mark |
| soon | days 3..14 | `3 days` ... `14 days` | `warn-bg` / `warn` | clock |
| ok | days >= 15 | no badge (spec: "otherwise no badge") | - | - |
| lifetime | pattern lifetime | `Forever` | `surface-2` / `ink-2` | infinity |

Expired is the only solid badge, so it stays distinguishable from critical without colour (text and icon differ as well). Contrast: danger/on-accent is about 6.5:1 light, over 10:1 dark; the other pairs are the existing >= 5.4:1 pairs. Day counts use ICU plurals (ru/uk have three forms); `Today` is a separate string. The badge has `aria-label` equal to its text.

## 3. States (per segment)

| State | Treatment |
|---|---|
| Empty (total 0) | `text-draft` icon (calendar / key), headline, one-line prompt, accent button. Subscriptions: "No subscriptions yet" / "Track what renews and when." / `Add subscription`. Licenses: "No licenses yet" / "Keep keys and expiry dates in one place." / `Add license`. No count. |
| No match | search icon, "Nothing matches", secondary `Reset` (resets the filter), count `0 of N`. Deleting the last visible item under a filter shows this, not empty. |
| Loading | 4 skeleton cards (about 88px high, text lines only, no cover block), `aria-busy`, no count; the segmented control and filter button are already usable. |
| Load error | full-area message and `Retry` (44px), segmented control stays. |
| Offline (Phase 4: online-first, no cache) | A failed load while the network is down shows the load-error state with the wording "You are offline. Check the connection and retry." A failed write (create, edit, renew, delete) keeps everything as it was, keeps the sheet open with the typed values, and shows the failure in the sheet's alert area (list screens: the toast), wording "No connection. Nothing was saved." There is no banner, no pending dot and no queue before the offline sync phase (10). |
| Server errors | 400 `validation`: message next to the field when the field is known (expiry, custom days, remind days) else the sheet alert; 404/410 on a row: it leaves the list with a toast "This item no longer exists"; 5xx: sheet alert / toast with the generic message. |
| Sync pending, sync error, push denied | not applicable in Phase 4 (Phases 5 and 6). |

## 4. Filter sheet (expiring soon)

The standard filter sheet (bottom sheet on phones, centered dialog from 768px): header `Reset` (left, returns to Any), `Done` (right); a `bg-surface rounded-md` group with one tri-state row, "Expiring soon" (52px row, box + label + word, Any / Only / Hide cycling on each tap, `role=checkbox`, `aria-checked` false / true / mixed); a footnote under the group, `text-foot text-ink-2`: "Expiring soon means 14 days or less, including today. Expired items are not included." (ru and uk run about 30% longer; the note wraps); the primary footer button `Show 3 of 12`, with live counts. Only = critical and soon; Hide removes them; expired, ok and lifetime are unaffected in both. One row is deliberate: the spec defines one criterion, the sheet keeps the same pattern so a second one can be added later.

## 5. Add / edit sheet

Bottom sheet below `md`, centered dialog from it; content height, scrolls inside (max 90dvh), keyboard-aware like the media add sheet (sheet follows the visual viewport). Header: title `New subscription` / `Edit subscription` (license twins; it wraps to two lines instead of truncating) with `Cancel` at the right (`min-w-16`), as in every sheet. `Save` is a full-width accent button pinned in the sheet footer (44 high), always visible while the form scrolls (accepted deviation from a header Save). A failed save shows its alert in that footer, directly above Save, so it is visible however far the form is scrolled; field-level 400 messages stay under their fields. The sheet opens with the Name field focused on create (keyboard up, fast capture), not on edit. All inputs 16px with a visible label above (`text-foot text-ink-2`), `bg-surface-2 rounded-md`, 44px minimum.

Fields in order:
1. Name (required, max 200).
2. Renewal: five options as a wrapping radio group of pills (`role=radiogroup`, 44px pills, selected `accent-soft` with accent text and a check icon): Monthly, Yearly, Custom, One-off, Lifetime. Default Monthly. Wrapping, not a segmented row, so ru/uk labels never truncate.
3. Every N days: number input, `inputmode=numeric`, only when Custom, 1..36500, helper "days between renewals".
4. Expiry date: native `type=date` (iOS wheel), required, max 2999-12-31, past dates allowed (the Expired badge is the feedback). Hidden entirely for Lifetime.
5. Remind me: stepper `-  3 days before  +` (two 44x44 buttons, value in the middle, 1..14, buttons disabled at the bounds, default 3). Hidden for Lifetime (the client sends 3, Q8).
6. Cost: optional text, max 100, placeholder "e.g. 9.99 USD / month" (free text; no currency model).
7. License only: License key, a multi-line textarea (3 rows, grows to 8 then scrolls), `autocapitalize=off`, `autocorrect=off`, `spellcheck=false`, monospaced, `overflow-wrap:anywhere`, max 10000. On edit it holds the stored key in clear text, since the user chose to edit; clearing it removes the key (contract). The label carries no "secret" claims.
8. Description: optional textarea, max 20000.

Validation: Save is never disabled by validation (only while a request runs). With Name blank, Custom without a positive number or Expiry missing (not for Lifetime) a Save tap sends nothing, shows every error, outlines the bad fields in `danger` (`[aria-invalid]`, the focus ring wins while the field is focused) and focuses the first one. Errors appear as `text-foot text-danger` under the field after the field is touched or on a Save attempt; they are associated with the input (`aria-describedby`). Switching to Lifetime keeps the typed date in memory but does not send it; switching back restores it. Edit sends only changed fields. A failed create keeps the sheet open and retries with the same id.

## 6. Detail sheet

Opens from the card, content height, header `Close`. No cover: a grouped list like Settings (`bg-surface rounded-md`, 0.5px separators, rows min 44 high):
- Title `detail-title` (22/28, wraps), the urgency badge under it.
- Rows (label left in `ink-2`, value right/wrapping): Expires (`15 Apr 2026`; absent for lifetime), Renewal (`Monthly`, `Every 45 days`, `One-off`, `Lifetime`), Remind (`3 days before`; absent for lifetime), Cost (absent when empty).
- License only, Key row: masked as a fixed run of bullets (not the real length) plus a `Reveal` text button (44px, accent). Revealed: the key in monospace, wrapping, `user-select:text` (long press copies, no extra copy button in Phase 4), button becomes `Hide`. The key is masked again whenever the sheet closes, and again after Edit saves (state lives in the open sheet only; closing the screen or switching segments resets it). `aria-live` announces "Key shown" / "Key hidden".
- Description, full text, `whitespace-pre-line`, or nothing when empty (no "No description" row: the action buttons are the point of the sheet).
- Actions: primary full-width `Renewed` (accent, 48px) then, in one row of pills, `Edit` and `Delete` (the Delete pill `danger-bg` / `danger`, as media).

Renewed: enabled only for Monthly, Yearly and Custom. For One-off and Lifetime it is disabled (`aria-disabled`, 60% opacity) and a footnote under it says "One-off and lifetime items can't be renewed." Tapping it sends the shown date as `expectedExpiryDate`, shows a spinner in the button and disables it; no optimistic update (the date is computed by the server). On success the date row and badge update in place and a toast shows "Renewed until 15 Apr 2026" (a stale no-op simply shows the current server date). Failure: the toast with the reason (offline, past 2999 "Can't renew: the date would be out of range"), nothing changes. An overdue item may stay overdue after one renewal; the user taps again (spec).

Delete (button or swipe): the existing `ConfirmDialog` (centered everywhere, Cancel focused): title "Delete this item?", body `"{name}" will be deleted. This cannot be undone.` (license: the key is deleted with it), confirm `Delete` in danger. It waits for the server; no Undo before the offline sync phase (10); a failure keeps the row and shows a toast.

## 7. Touch, safe areas, dark mode, i18n

- 44pt: segments 44, filter button 44, stepper buttons 44, renewal pills 44, Reveal/Hide 44, row of detail 44, Renewed 48, FAB 56. Card hit area is the whole card.
- Safe areas: as media (scroll region pads the top inset, FAB at `bottom: inset + 5rem` on phones, sheets add the bottom inset). The FAB (`Add subscription` / `Add license` as its `aria-label`) belongs to the active segment.
- Dark mode: only tokens, no literals; the solid Expired badge is `danger` (light red in dark) with the near-black `on-accent`.
- i18n: all labels wrap or grow in height; no fixed widths on text; badge text is short but `Expired` / `Просрочено` / `Прострочено` and plural day forms (`14 дней`, `14 днів`) must still fit the pill, which grows horizontally. The meta line (`15 апр. 2026 г. · Ежемесячно · 9,99 USD`) wraps to two lines. The Cancel/Save header buttons keep `min-w-16`; `Show 3 of 12` is `Показать 3 из 12` / `Показати 3 з 12` and fits the full-width button. Dates and numbers via `Intl` with the device locale.

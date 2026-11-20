# Interactions

User flows and edge cases. Visual tokens, components and the state table are in `design-system.md`; business rules (dedup, renewal dates, notification times, sync protocol) are in `docs/openspec/specs/` and win on any conflict.

## Flows

**Add an item** (two taps from a list)
1. Tap "+" on Books or Movies; the add sheet opens with the keyboard up.
2. Type; after the debounce results appear. Tap a result: it is added, the sheet closes, the card appears at once.
- The last row of the results is always the draft entry `Add "text" as draft` (also with no match, no provider key or offline). When the typed text equals a title already in the library the draft entry is hidden (the server would answer 409).
- A provider item already in the library shows a tick and its row is highlighted and not selectable.
- Failures (search, add) show in an alert area inside the sheet, above the list, with their action (Retry, Open Settings); the floating toast is for the lists screens only. A rate limit with `Retry-After` shows "Try again in N s" instead of Retry. Open Settings closes the sheet first.
- One status line under the field (offline, or search unavailable, or the missing-key explanation, or "Searching in X"); the length hint shows only below 3 characters.
- While results change, taps on rows are ignored for 300 ms (the draft row moves); while an add is pending the field and the info buttons are disabled. The info button opens a preview sheet whose Add button is pinned at the bottom; the add sheet and the list beneath are inert while it is open.
- With the keyboard up the sheet sizes to the visual viewport, so the results and the draft row stay reachable.

**Navigation**: below 768px a bottom tab bar, from 768px a left sidebar with the same entries; both use the `#/books` style hash, so the Back gesture, reloads and the stored last tab behave identically, and tapping the current entry scrolls to the top.

**Sheets and dialogs**: the detail, add, preview, filter, sort and More views are bottom sheets on phones and centered dialogs from 768px; behaviour (focus moves in, Tab stays inside, Escape and the scrim close, focus returns to the opener) is the same. The delete confirmation is a centered dialog everywhere.

**Focus ring**: the card's open area (the big title/meta button) shows no focus ring for anyone (owner decision); the card's other buttons keep the global ring. Elsewhere pointer and touch users see no ring on the control that gets focus back when a sheet closes (and none on the dialog's first focused button); keyboard users (Escape, Enter, Tab) keep the 2px ring and the focus return. If the opener left the list (an item marked read while the default hides read items) a keyboard user lands on the search field; a pointer user keeps no focus.

**Change status or favourite**: tap the heart or eye on the card, or open the detail sheet. Feedback is immediate. A seen item leaves the default view (seen is hidden) with a short fade.

**Delete**: swipe left on the card or use the detail sheet. Deletion always asks first: a centered dialog names the item and says it cannot be undone (Cancel is focused; Cancel, Escape and a scrim tap send nothing). On confirm the request is sent and the row leaves only when the server answers; a failure keeps the row (the swiped card snaps back) and shows an error toast. There is no Undo before Phase 5, which may replace the dialog by an Undo toast. A deleted id is tombstoned and never recreated (410).

**More menu** (Movies, button next to Sort): a bottom sheet with the list's extra actions. It holds one action today, "Refresh series status" (explicit, sequential, stops on a failure with the message inside the sheet), and stays a menu rather than a bare button so the header keeps one pattern and further actions (e.g. export) have a place; Books has no More button.

**Filter and sort**: the filter sheet is tri-state (Any, Only, Hide) and applies live; the footer shows the result count. Reset returns to the default (seen hidden). Filter and sort are device-local, not synced.

**Renew a reminder** (Reminders tab, two taps): open the reminder, tap Renew. Enabled only for renewable types; the expiry advances by one period and a toast confirms. In Phase 4 the app waits for the server (no optimistic update, nothing is rescheduled; notifications arrive in Phase 6), see `reminders.md`. The same button is the only path from a push notification, because iOS Web Push has no action buttons: tapping the notification opens the reminder, the user taps Renew.

## Offline and sync

- Writes work offline: the change shows immediately with a pending dot and is queued; nothing is blocked.
- Add sheet offline: search is disabled, drafts still work.
- Status banners (offline, syncing N changes, N changes could not sync with Retry) are described in `design-system.md`. The app stays usable with cached data in every state.
- Add then delete while offline both sync in order; the item never appears for the other devices.
- Conflicts, retries and auth expiry are defined in `docs/openspec/specs/offline-sync/spec.md` and `identity/spec.md`.

## Account data (Settings)

- Export my data: one tap downloads the JSON from `/me/export`.
- Delete account: opens a confirmation dialog (permanent, all data removed); confirm calls `DELETE /me` and shows the landing page, cancel changes nothing. Deleting a book or movie uses the same dialog.

## Notifications permission

- No permission: a banner on Reminders links to Settings; reminders stay fully usable.
- Enable: the browser prompt appears only from a user tap. On grant the banner disappears and the push subscription is sent to the server.
- Denied: the banner stays; Settings shows "Blocked" with the iOS Settings instructions (the app cannot re-prompt). Granting later in system settings catches up pending notifications.
- Not installed on iOS: Settings explains push needs the Home Screen app (16.4+) and opens the install steps.

## Edge cases

- Filter plus empty result: "Nothing matches" with Reset; the count reads `0 of N`.
- Deleting the last visible item under a filter shows the no-match state, not the empty state.
- Renewing an overdue reminder may leave it overdue; the user renews again (rule in the reminders spec).
- Closing the app mid-sync is safe: the queue persists and resumes on next open.

## Checklist for review

- Add, delete, edit offline, then reconnect.
- Every list in empty, no-match, loading, offline and error states.
- Tap targets 44px, safe areas, dark mode, ru/uk overflow.
- Keyboard: Tab through all controls, Escape closes sheets; screen reader announces counts.

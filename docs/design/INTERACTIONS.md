# Interactions

User flows and edge cases. Visual tokens, components and the state table are in `design-system.md`; business rules (dedup, renewal dates, notification times, sync protocol) are in `docs/openspec/specs/` and win on any conflict.

## Flows

**Add an item** (two taps from a list)
1. Tap "+" on Books or Movies; the add sheet opens with the keyboard up.
2. Type; after the debounce results appear. Tap a result: it is added, the sheet closes, the card appears at once.
- No match, no provider key or offline: "Can't find it?" row adds the typed text as a draft.
- An item already in the library shows a tick and its row is disabled; a draft can still be added.

**Change status or favourite**: tap the heart or eye on the card, or open the detail sheet. Feedback is immediate. A seen item leaves the default view (seen is hidden) with a short fade.

**Delete**: swipe left on the card or use the detail sheet. Deletion is immediate with an Undo toast; there is no confirmation dialog. The delete mutation stays in the outbox for the 4 s Undo window; Undo drops it. Deleting a record whose create has not been sent cancels both mutations (nothing is ever sent). After the window the delete is sent and cannot be undone: a tombstoned id is never recreated (410).

**Filter and sort**: the filter sheet is tri-state (Any, Only, Hide) and applies live; the footer shows the result count. Reset returns to the default (seen hidden). Filter and sort are device-local, not synced.

**Renew a reminder** (Reminders tab, two taps): open the reminder, tap Renew. Enabled only for renewable types; the expiry advances by one period, the notification is rescheduled, the card updates at once and a toast confirms. The same button is the only path from a push notification, because iOS Web Push has no action buttons: tapping the notification opens the reminder, the user taps Renew.

## Offline and sync

- Writes work offline: the change shows immediately with a pending dot and is queued; nothing is blocked.
- Add sheet offline: search is disabled, drafts still work.
- Status banners (offline, syncing N changes, N changes could not sync with Retry) are described in `design-system.md`. The app stays usable with cached data in every state.
- Add then delete while offline both sync in order; the item never appears for the other devices.
- Conflicts, retries and auth expiry are defined in `docs/openspec/specs/offline-sync/spec.md` and `identity/spec.md`.

## Account data (Settings)

- Export my data: one tap downloads the JSON from `/me/export`.
- Delete account: opens a confirmation dialog (permanent, all data removed); confirm calls `DELETE /me` and shows the landing page, cancel changes nothing. This is the only destructive action with a dialog.

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

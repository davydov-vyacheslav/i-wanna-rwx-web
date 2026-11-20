# reminders Specification

Subscriptions and licenses: calendar-based expiry reminders delivered by server-side Web Push. Mandatory reading before touching reminders, the scheduler or push.

Names follow `V001__initial_schema.sql` (tables `subscriptions`, `licenses`) and `api/openapi.yaml` (tags `subscriptions` and `licenses`: `/api/v1/subscriptions`, `/api/v1/licenses`, each with `/{id}` and `/{id}/renew`). Backend: one module `reminders` with sub-packages `subscription`, `license` and `common` (abstract entity, repository and service base, renewal arithmetic). Frontend: `features/reminders`.

Delivery: Phase 4 (done) is online-first CRUD and manual renewal; notifications, scheduler and push are Phase 9, offline and sync the offline sync phase (10, after the first deploy), encryption of the license key the Security phase (8). The requirements of those phases below are stated for when they land; see "Phase scope". Screens and interaction: `docs/design`. The unified "reminder" notion in older notes means one of these two types; sync resource types are `subscription` and `license`.

## Terms
- Subscription: recurring service. License: software license with an optional key. Both share name, expiry date, renewal pattern, custom renewal days, remind days, cost, description, version.
- Expiry date is a calendar `DATE` (`YYYY-MM-DD`), timezone-agnostic. Instants (notification times) are UTC. "Today" and "09:00" are in the user's stored IANA timezone.
- Renewal pattern: `monthly`, `yearly`, `lifetime`, `custom` (uses custom renewal days), `none`.
- Remind days: integer 1 to 14, days before expiry (required for every pattern, including `lifetime`).

## Requirements

### Requirement: Subscription and license records
The system SHALL let a user create, view, edit and delete subscriptions (name, expiry date, renewal pattern, custom renewal days when pattern is `custom`, remind days, cost, description) and licenses (the same fields plus an optional license key). Remind days outside 1 to 14 SHALL be rejected with 400; remind days are required for every pattern, including `lifetime`. Every field except the id is editable after creation: `PATCH` accepts any create field (for licenses also the key; an empty string clears cost, description and the key) and the merged record must stay valid (400 `validation` otherwise); absent fields are unchanged and a change equal to the stored content writes nothing (no `version` or `updatedAt` change). Records have a client-generated UUID `id`: `POST` is idempotent by id (200 with the stored record when the id is already live, 201 on creation, 410 `gone` for a deleted id; there is no duplicate rule), and a missing, foreign or deleted id on `GET` is 404 (reads never return tombstones); a missing or foreign id on `PATCH`, `DELETE` and `renew` is 404, a deleted id on `PATCH`, `renew` and `POST` is 410 (`DELETE` of a deleted id is 204). Deleting tombstones the row and nulls `license_key` and `description`. Subscriptions and licenses are separate resources (`/api/v1/subscriptions`, `/api/v1/licenses`, bare-array lists, operations tagged `subscriptions` and `licenses`), each shown in its own segment of the Reminders tab. Storage enforces the invariants (V001 CHECK constraints) in addition to the API.

#### Scenario: Create monthly subscription
- **WHEN** the user enters name "Netflix", an expiry date, renewal monthly, cost and remind days 3
- **THEN** the subscription is created (201) and appears in the Subscriptions list

#### Scenario: Invalid remind days
- **WHEN** remind days is 0 or 15
- **THEN** the response is 400 and nothing is stored

#### Scenario: Custom without days
- **WHEN** renewal pattern is `custom` and custom renewal days is missing or not positive
- **THEN** the response is 400

#### Scenario: Identical patch
- **WHEN** a PATCH carries values equal to the stored ones
- **THEN** the record is returned and `version` and `updatedAt` are unchanged


### Requirement: Phase scope
In the first delivery (Phase 4) reminders SHALL be read and written online through the REST API only: no local cache, no outbox, no `/sync/*`, no notification instant or state, no scheduler, no Web Push, no push hint or banner. Manual renewal is part of this delivery. The requirements "Notification time", "Late notification", "Switching to lifetime cancels notification", "Push delivery" and "Reminders offline" stay as written and take effect in Phase 9 and Phase 10; Phase 9 derives notifications from the stored expiry date, remind days, pattern and the user's timezone. Filters, order and urgency work over the list loaded in memory.

#### Scenario: Create or renew in Phase 4
- **WHEN** a reminder is created or renewed
- **THEN** nothing is scheduled or sent and no notification state is stored

### Requirement: Date bounds
An expiry date SHALL not be after 2999-12-31 and custom renewal days SHALL be at most 36500; the API rejects violations (and a renewal whose result would pass the bound) with 400 `validation`, and V001 enforces both. Dates in the past are valid.

#### Scenario: Renewal past the bound
- **WHEN** a yearly reminder expiring 2999-06-01 is renewed
- **THEN** the response is 400 and the expiry is unchanged

### Requirement: Expiry required except lifetime
Every reminder with a pattern other than `lifetime` SHALL have an expiry date; the API SHALL reject a null expiry for those patterns and the database enforces it (`expiry_date` is nullable, `CHECK (renewal_pattern = 'lifetime' OR expiry_date IS NOT NULL)`; the contract's `expiryDate` is nullable). A `custom` pattern SHALL have positive custom renewal days (also a CHECK). A `lifetime` reminder never expires and SHALL NOT be shown as expiring.

#### Scenario: Missing expiry
- **WHEN** a reminder with pattern `yearly` or `none` is saved without an expiry date
- **THEN** the response is 400

#### Scenario: Lifetime
- **WHEN** the user selects renewal lifetime
- **THEN** the reminder is shown as never expiring and no notification is ever scheduled

### Requirement: Renewal (prolongate)
Renewing SHALL be an explicit user action (`/renew`, "Renewed") that sets the new expiry date to the old expiry date plus one renewal period: one calendar month for `monthly`, one calendar year for `yearly`, custom renewal days for `custom`; month and year additions clamp to the last day of the target month and the clamped day is not remembered. Renewal SHALL be rejected for `lifetime` and `none` (400, checked before the stale-date comparison) and SHALL NOT change the license key. `expectedExpiryDate` is required in the `POST .../{id}/renew` body (and in the sync `renew` mutation from Phase 10) so that a stale repeat does not renew twice; concurrent renewals of one record are serialized, so exactly one applies. The response is 200 with the record in both the renewed and the no-op case (a no-op changes neither `version` nor `updatedAt`); 400 for `lifetime` and `none`, 404 for an unknown or foreign id, 410 for a deleted id. When notifications exist (Phase 9) they follow the new expiry date.

#### Scenario: Renew monthly
- **WHEN** the user renews a monthly subscription expiring 2026-03-15
- **THEN** the expiry becomes 2026-04-15

#### Scenario: Clamp does not keep the anchor
- **WHEN** a monthly reminder expiring 2026-01-31 is renewed twice
- **THEN** the expiry becomes 2026-02-28 and then 2026-03-28

#### Scenario: Renew one-off
- **WHEN** the user renews a reminder with pattern `none` or `lifetime`
- **THEN** the response is 400 and the expiry is unchanged

#### Scenario: Stale renew
- **WHEN** a renew arrives with an expected expiry date that no longer matches the current one
- **THEN** it is a no-op and the current record is returned


### Requirement: Notification time
For a reminder with a non-lifetime pattern the scheduled notification instant SHALL be 09:00 in the user's timezone on the date (expiry date minus remind days). If that instant is already in the past when computed, the notification SHALL be moved to 09:00 today if still ahead, otherwise to 09:00 tomorrow; but a notification SHALL never be scheduled after the end of the expiry date (user timezone), in which case none is scheduled. The scheduler SHALL send each notification at most once per computed instant. The notification SHALL be recomputed on create, edit of expiry, pattern or remind days, renewal, and user timezone change.

#### Scenario: Normal
- **WHEN** a reminder expires 2026-03-15 with remind days 3 and timezone Europe/Kyiv
- **THEN** the notification is due at 2026-03-12 09:00 Europe/Kyiv, stored as a UTC instant

#### Scenario: Window already passed, same day still ahead
- **WHEN** the reminder date has passed but today 09:00 has not
- **THEN** the notification is due today at 09:00

#### Scenario: Window passed, 09:00 passed
- **WHEN** today 09:00 has passed and tomorrow is not after the expiry date
- **THEN** the notification is due tomorrow at 09:00

#### Scenario: Never after expiry
- **WHEN** the only remaining candidate instant falls after the expiry date
- **THEN** no notification is scheduled

#### Scenario: Timezone change
- **WHEN** the user changes timezone
- **THEN** all pending notification instants are recomputed

### Requirement: Late notification
A notification missed because the server was down SHALL be sent late, but only until the end of the expiry date in the user's timezone.

#### Scenario: Server back after outage
- **WHEN** the server restarts after the due instant and the expiry date has not ended
- **THEN** the pending notification is sent once

#### Scenario: Too late
- **WHEN** the expiry date has ended
- **THEN** the missed notification is dropped

### Requirement: Switching to lifetime cancels notification
Changing a reminder's pattern to `lifetime` SHALL cancel its pending notification.

#### Scenario: Switch to lifetime
- **WHEN** the user edits a monthly reminder to lifetime
- **THEN** no notification is sent for it afterwards

### Requirement: Push delivery
Notifications SHALL be Web Push (VAPID) sent only when the user has enabled push (the stored push preference, which the Push phase adds to the user's settings). Web Push on iOS has no action buttons: tapping the notification SHALL open the reminder, where the user presses "Renewed". If the user has not enabled notifications, the app SHALL show a one-time hint and nothing more (no repeated prompts, no fallback channel). Notifications SHALL NOT be sent while the server cannot reach the user's push endpoint; nothing is queued client-side.

#### Scenario: Notification tap
- **WHEN** the user taps a push notification
- **THEN** the app opens the reminder detail

#### Scenario: Push disabled
- **WHEN** the user has not enabled push
- **THEN** no notification is sent and the one-time hint is shown once

### Requirement: Urgency status
The client SHALL derive the status from days remaining (expiry date minus today in the user's timezone): `expired` when the expiry date is before today; critical when fewer than 3 days remain; expiring soon at 3 to 14 days; lifetime shown as forever; otherwise (15 or more days, the "ok" state) no badge. Expiry today is 0 days: critical, not expired. "Today" is the date in the user's stored IANA time zone (`UserSettings.timeZone`), not the device zone. The urgency is only a badge; it does not group or reorder the list (order: see "Reminders list order").

#### Scenario: Critical
- **WHEN** 2 days remain
- **THEN** the critical badge is shown with "2 days"

#### Scenario: Expiring soon
- **WHEN** 7 days remain
- **THEN** the expiring-soon badge is shown with "7 days"

#### Scenario: Expired
- **WHEN** the expiry date is before today
- **THEN** the expired badge is shown

### Requirement: License key protection
Until the Security/GDPR phase (which must run before the first deploy) the license key SHALL be stored and returned in plaintext in a plain `license_key` column: returned to its owner on create, get, list and in the account export, shown masked in the detail view until revealed by the user, multi-line capable, and SHALL NOT appear in logs, notifications, error messages or any other user's data. There is no encryption, key version or key configuration in this phase. Known, accepted trade-off: the plaintext key is also held in the client's in-memory cache and, from Phase 10, in IndexedDB and in the exported file; the Security phase revisits the stored key (encrypted column), the client cache and the export.

#### Scenario: Create license with key
- **WHEN** the user saves a license with a key
- **THEN** the key is stored, returned to its owner, and the detail view shows it masked

#### Scenario: Patch without key
- **WHEN** a license is edited without sending `licenseKey`
- **THEN** the stored key is unchanged

#### Scenario: Key not logged
- **WHEN** a license with a key is created or rejected
- **THEN** neither the response problem nor the logs contain the key

Target of the Security phase (not in force yet): the key is stored encrypted (AES-GCM, versioned key recorded with the row) and existing keys still decrypt after a key rotation.


### Requirement: Reminders list filters
Each segment (Subscriptions, Licenses) SHALL offer an expiring-soon filter (Any, Only, Hide, cycling on each tap; "soon" means the critical and expiring-soon urgency states), evaluated on the client over the loaded list (offline from Phase 10), defaulting to no filter (nothing hidden), remembered per device and list and not synced; Reset SHALL return to the default. The toolbar filter button SHALL be filled with a badge of the number of active criteria, as for books and movies. The header count SHALL follow the "<shown> of <total>" rule of the media lists, per segment.

#### Scenario: Expiring soon only
- **WHEN** the expiring-soon filter is Only
- **THEN** only reminders in the critical or expiring-soon state are listed; expired ones are not, and the badge shows 1

#### Scenario: Default
- **WHEN** a segment is opened for the first time
- **THEN** every record of that type is listed and the filter button is not filled


### Requirement: Reminders list order
Each list SHALL be ordered by expiry date, soonest first, with expired reminders first and lifetime reminders last; ties SHALL be broken by name (locale-aware, case-insensitive) and then id. The server API provides no sorting (lists come back in creation order); any user-selectable sort is a client-side concern and not in scope now.

#### Scenario: Order
- **WHEN** a list contains an expired item, an item expiring in 3 days, an item expiring in 30 days and a lifetime item
- **THEN** they appear in that order

### Requirement: Reminders navigation
The app SHALL have a Reminders tab (the tab bar stays Books, Movies, Reminders, Settings) containing a segmented control with two segments, Subscriptions and Licenses, under the Reminders header; routes `/reminders/subscriptions` and `/reminders/licenses`. Each segment is its own list with its own expiring-soon filter, count and order. The last chosen segment SHALL be remembered per device as local UI state (not synced); the default is Subscriptions. Either list is two taps away (tab, then segment).

#### Scenario: Remembered segment
- **WHEN** the user last viewed Licenses and opens the Reminders tab again on the same device
- **THEN** the Licenses segment is shown

#### Scenario: First open
- **WHEN** the Reminders tab is opened for the first time, or the stored value is unreadable
- **THEN** the Subscriptions segment is shown

### Requirement: Account export and deletion for reminders
`GET /me/export` SHALL include the caller's live subscriptions and licenses; license keys are included in plaintext (accepted trade-off, see "License key protection"). Account deletion SHALL remove every subscription and license row of the user.

#### Scenario: Export
- **WHEN** a user with one license holding a key exports their data
- **THEN** the export lists that license with its key and no other user's records

### Requirement: Reminders offline
Subscriptions and licenses SHALL be cached locally and edits queued in the outbox as resource types `subscription` and `license` per `offline-sync`; renewal is queued as an operation, not as a state; reminders SHALL be isolated per user.

#### Scenario: Edit offline
- **WHEN** the user edits a reminder offline
- **THEN** the change is visible immediately and synced when online, and notifications are only ever sent by the server

## Decisions (formerly open)
- Order and sort: the order above is fixed; sorting, if ever offered, is client-side and the API does nothing for it.
- Prolongate on an overdue reminder adds one period to the old expiry and may leave it overdue; the user renews again.
- Renewal `none` is a one-off expiry without renewal; the late notification window lasts until the end of the expiry day; switching to `lifetime` cancels the pending notification; month and year additions clamp to the last day of the target month.

## Settled in Phase 4 (implementation)
- PATCH normalisation: the generated contract cannot tell an absent property from `null`, so both mean unchanged and no field can be set back to null by `null`. An empty (blank) string clears `cost`, `description` and the license key; choosing `lifetime` clears the expiry date; custom renewal days exist only for `custom` (other patterns store none). `PATCH {}` is a 200 no-op (no `version` or `updatedAt` change). Changing lifetime to another pattern without an expiry date in the same patch is 400 `validation` (merged record).
- Statuses by resource state: `GET` of a deleted record is 404; `PATCH`, `renew` and `POST` of a deleted id are 410 `gone`; `DELETE` of a deleted id is 204; foreign ids are 404 everywhere. Lists are bare arrays of live records in creation order; the client sorts.
- Concurrency: writes lock the row (`PESSIMISTIC_WRITE`); a concurrent `POST` of one id is answered by re-reading the winner (200 live, 410 tombstone).
- License key: plaintext in a plain `license_key` column until the Security phase (ROADMAP phase 8), with no key version and no key configuration. Consequences the Security phase inherits: the key sits in plaintext in the database, the API responses (create, get, list), the client TanStack cache, IndexedDB (from Phase 5) and the `/me/export` file; it stays out of logs, `toString` and problem bodies.
- Two tags (`subscriptions`, `licenses`), two generated APIs; two resources with separate tables and endpoints over one abstract base in `reminders.common`.
- Navigation: four-tab shell (Books, Movies, Reminders, Settings); the Reminders tab holds two segments. Hash routes `#/reminders/subscriptions` and `#/reminders/licenses`; a bare or unknown `#/reminders` is rewritten to the remembered segment. The remembered segment and each segment's expiring-soon filter are kept in localStorage per device and user (`rwx.reminders.<userId>`; unreadable means defaults).
- Urgency: no "ok" badge from 15 days remaining; the day count uses the user's time zone from settings.
- "Renewed" waits for the server: no optimistic update, the button shows a spinner while pending (no Undo before the offline sync phase (10)).
- The sheet hides the remind-days field for a lifetime (it keeps its value, default 3, and is still sent: `remindDays` is required); validation errors on a 400 show the server's field message (English, no localizable code in the contract).

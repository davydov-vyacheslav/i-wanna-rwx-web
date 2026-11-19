# reminders Specification

Subscriptions and licenses: calendar-based expiry reminders delivered by server-side Web Push. Mandatory reading before touching reminders, the scheduler or push.

Names follow `V001__initial_schema.sql` (tables `subscriptions`, `licenses`) and `api/openapi.yaml` (tag `reminders`: `/api/v1/subscriptions`, `/api/v1/licenses`, each with `/{id}` and `/{id}/renew`). Screens and interaction: `docs/design`. The unified "reminder" notion in older notes means one of these two types; sync resource types are `subscription` and `license`.

## Terms
- Subscription: recurring service. License: software license with an optional key. Both share name, expiry date, renewal pattern, custom renewal days, remind days, cost, description, version.
- Expiry date is a calendar `DATE` (`YYYY-MM-DD`), timezone-agnostic. Instants (notification times) are UTC. "Today" and "09:00" are in the user's stored IANA timezone.
- Renewal pattern: `monthly`, `yearly`, `lifetime`, `custom` (uses custom renewal days), `none`.
- Remind days: integer 1 to 14, days before expiry.

## Requirements

### Requirement: Subscription and license records
The system SHALL let a user create, view, edit and delete subscriptions (name, expiry date, renewal pattern, custom renewal days when pattern is `custom`, remind days, cost, description) and licenses (the same fields plus an optional license key). Remind days outside 1 to 14 SHALL be rejected with 400. All of these fields except the id and the pattern-independent defaults are editable after creation (`PATCH` accepts name, expiry date, renewal pattern, custom renewal days, remind days, cost, description and, for licenses, the key; the merged record must stay valid). Records have a client-generated UUID `id`: `POST` is idempotent by id (200 with the stored record when the id is already live, 201 on creation, 410 `gone` for a deleted id; there is no duplicate rule), and a missing or foreign id on `GET`, `PATCH`, `DELETE` and `renew` is 404, a deleted id 410 (`DELETE` of a deleted id is 204). Deleting tombstones the row and nulls `license_key` and `description`; pulled tombstones carry no body. Subscriptions and licenses SHALL be shown in one list with a type filter (see the list requirements below). Storage enforces the invariants below (V001 CHECK constraints) in addition to the API.

#### Scenario: Create monthly subscription
- **WHEN** the user enters name "Netflix", an expiry date, renewal monthly, cost and remind days 3
- **THEN** the subscription is created and a notification is scheduled per the notification rules

#### Scenario: Invalid remind days
- **WHEN** remind days is 0 or 15
- **THEN** the response is 400 and nothing is stored

#### Scenario: Custom without days
- **WHEN** renewal pattern is `custom` and custom renewal days is missing or not positive
- **THEN** the response is 400

### Requirement: Expiry required except lifetime
Every reminder with a pattern other than `lifetime` SHALL have an expiry date; the API SHALL reject a null expiry for those patterns and the database enforces it (`expiry_date` is nullable, `CHECK (renewal_pattern = 'lifetime' OR expiry_date IS NOT NULL)`; the contract's `expiryDate` is nullable). A `custom` pattern SHALL have positive custom renewal days (also a CHECK). A `lifetime` reminder never expires and SHALL NOT be shown as expiring.

#### Scenario: Missing expiry
- **WHEN** a reminder with pattern `yearly` or `none` is saved without an expiry date
- **THEN** the response is 400

#### Scenario: Lifetime
- **WHEN** the user selects renewal lifetime
- **THEN** the reminder is shown as never expiring and no notification is ever scheduled

### Requirement: Renewal (prolongate)
Renewing SHALL be an explicit user action (`/renew`, "Renewed") that sets the new expiry date to the old expiry date plus one renewal period: one calendar month for `monthly`, one calendar year for `yearly`, custom renewal days for `custom`. Renewal SHALL be rejected for `lifetime` and `none`. The notification SHALL be rescheduled from the new expiry date. Renewal from the client SHALL carry the expiry date it saw (`expectedExpiryDate`, required in the `POST .../{id}/renew` body and in the sync `renew` mutation) so that a stale repeat does not renew twice. The response is 200 with the record in both the renewed and the no-op case; 400 for `lifetime` and `none`, 404 for an unknown or foreign id, 410 for a deleted id.

#### Scenario: Renew monthly
- **WHEN** the user renews a monthly subscription expiring 2026-03-15
- **THEN** the expiry becomes 2026-04-15 and the notification is rescheduled

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
The client SHALL derive the status from days remaining (expiry date minus today in the user's timezone): `expired` when the expiry date is before today; critical when fewer than 3 days remain; expiring soon at 3 to 14 days; lifetime shown as forever; otherwise no badge. The urgency is only a badge; it does not group or reorder the list (order: see "Reminders list order").

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
The license key SHALL be stored encrypted at rest (AES-GCM, versioned key recorded in `license_key_version`), SHALL be shown masked in the detail view until revealed by the user, SHALL be multi-line capable, and SHALL NOT appear in logs, notifications or error messages.

#### Scenario: Create license with key
- **WHEN** the user saves a license with a key
- **THEN** the key is stored encrypted and the detail view shows it masked

#### Scenario: Key rotation
- **WHEN** the encryption key version changes
- **THEN** existing keys still decrypt using their recorded version

### Requirement: Reminders list filters
The reminders screen SHALL show subscriptions and licenses in one list and offer a type filter (all, subscriptions, licenses; single-select, tapping the selected type returns to all) and an expiring-soon filter (Any, Only, Hide, cycling on each tap; "soon" means the critical and expiring-soon urgency states). Filters SHALL be evaluated on the client over the cached list so they work offline, default to no filter (nothing hidden), be remembered per device and not synced, and Reset SHALL return to the default. The toolbar filter button SHALL be filled with a badge of the number of active criteria, as for books and movies. The header count SHALL follow the same "<shown> of <total>" rule as the media lists.

#### Scenario: Type filter
- **WHEN** the user selects licenses
- **THEN** only licenses are listed and the badge shows 1

#### Scenario: Expiring soon only
- **WHEN** the expiring-soon filter is Only
- **THEN** only reminders in the critical or expiring-soon state are listed; expired ones are not

#### Scenario: Default
- **WHEN** the screen is opened for the first time
- **THEN** every reminder is listed and the filter button is not filled

### Requirement: Reminders list order
The list SHALL be ordered by expiry date, soonest first, with expired reminders first and lifetime reminders last; ties SHALL be broken by name (locale-aware, case-insensitive) and then id. The server API provides no sorting; any user-selectable sort is a client-side concern and not in scope now.

#### Scenario: Order
- **WHEN** a list contains an expired item, an item expiring in 3 days, an item expiring in 30 days and a lifetime item
- **THEN** they appear in that order

### Requirement: Reminders offline
Subscriptions and licenses SHALL be cached locally and edits queued in the outbox as resource types `subscription` and `license` per `offline-sync`; renewal is queued as an operation, not as a state; reminders SHALL be isolated per user.

#### Scenario: Edit offline
- **WHEN** the user edits a reminder offline
- **THEN** the change is visible immediately and synced when online, and notifications are only ever sent by the server

## Decisions (formerly open)
- Order and sort: the order above is fixed; sorting, if ever offered, is client-side and the API does nothing for it.
- Prolongate on an overdue reminder adds one period to the old expiry and may leave it overdue; the user renews again.
- Renewal `none` is a one-off expiry without renewal; the late notification window lasts until the end of the expiry day; switching to `lifetime` cancels the pending notification; month and year additions clamp to the last day of the target month.

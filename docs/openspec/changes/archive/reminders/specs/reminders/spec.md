# Delta: reminders (Phase 4)

Online-first subscriptions and licenses, each a segment of the Reminders tab. Notification, scheduler and push requirements of the base spec are unchanged and are delivered in Phase 6; offline requirements in Phase 5; encryption of the license key in the Security phase (before the first deploy).

## ADDED Requirements

### Requirement: Phase scope
In the first delivery (Phase 4) reminders SHALL be read and written online through the REST API only: no local cache, no outbox, no `/sync/*`, no notification instant or state, no scheduler, no Web Push, no push hint or banner. Manual renewal is part of this delivery. The requirements "Notification time", "Late notification", "Switching to lifetime cancels notification", "Push delivery" and "Reminders offline" stay as written and take effect in Phase 6 and Phase 5; Phase 6 derives notifications from the stored expiry date, remind days, pattern and the user's timezone. Filters, order and urgency work over the list loaded in memory.

#### Scenario: Create or renew in Phase 4
- **WHEN** a reminder is created or renewed
- **THEN** nothing is scheduled or sent and no notification state is stored

### Requirement: Date bounds
An expiry date SHALL not be after 2999-12-31 and custom renewal days SHALL be at most 36500; the API rejects violations (and a renewal whose result would pass the bound) with 400 `validation`, and V001 enforces both. Dates in the past are valid.

#### Scenario: Renewal past the bound
- **WHEN** a yearly reminder expiring 2999-06-01 is renewed
- **THEN** the response is 400 and the expiry is unchanged

### Requirement: Account export and deletion for reminders
`GET /me/export` SHALL include the caller's live subscriptions and licenses; license keys are included in plaintext (accepted trade-off, see "License key protection"). Account deletion SHALL remove every subscription and license row of the user.

#### Scenario: Export
- **WHEN** a user with one license holding a key exports their data
- **THEN** the export lists that license with its key and no other user's records

## MODIFIED Requirements

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

### Requirement: Renewal (prolongate)
Renewing SHALL be an explicit user action (`/renew`, "Renewed") that sets the new expiry date to the old expiry date plus one renewal period: one calendar month for `monthly`, one calendar year for `yearly`, custom renewal days for `custom`; month and year additions clamp to the last day of the target month and the clamped day is not remembered. Renewal SHALL be rejected for `lifetime` and `none` (400, checked before the stale-date comparison) and SHALL NOT change the license key. `expectedExpiryDate` is required in the `POST .../{id}/renew` body (and in the sync `renew` mutation from Phase 5) so that a stale repeat does not renew twice; concurrent renewals of one record are serialized, so exactly one applies. The response is 200 with the record in both the renewed and the no-op case (a no-op changes neither `version` nor `updatedAt`); 400 for `lifetime` and `none`, 404 for an unknown or foreign id, 410 for a deleted id. When notifications exist (Phase 6) they follow the new expiry date.

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

### Requirement: License key protection
Until the Security/GDPR phase (which must run before the first deploy) the license key SHALL be stored and returned in plaintext in a plain `license_key` column: returned to its owner on create, get, list and in the account export, shown masked in the detail view until revealed by the user, multi-line capable, and SHALL NOT appear in logs, notifications, error messages or any other user's data. There is no encryption, key version or key configuration in this phase. Known, accepted trade-off: the plaintext key is also held in the client's in-memory cache and, from Phase 5, in IndexedDB and in the exported file; the Security phase revisits the stored key (encrypted column), the client cache and the export.

#### Scenario: Create license with key
- **WHEN** the user saves a license with a key
- **THEN** the key is stored, returned to its owner, and the detail view shows it masked

#### Scenario: Patch without key
- **WHEN** a license is edited without sending `licenseKey`
- **THEN** the stored key is unchanged

#### Scenario: Key not logged
- **WHEN** a license with a key is created or rejected
- **THEN** neither the response problem nor the logs contain the key

### Requirement: Reminders list filters
Each segment (Subscriptions, Licenses) SHALL offer an expiring-soon filter (Any, Only, Hide, cycling on each tap; "soon" means the critical and expiring-soon urgency states), evaluated on the client over the loaded list (offline from Phase 5), defaulting to no filter (nothing hidden), remembered per device and list and not synced; Reset SHALL return to the default. The toolbar filter button SHALL be filled with a badge of the number of active criteria, as for books and movies. The header count SHALL follow the "<shown> of <total>" rule of the media lists, per segment.

#### Scenario: Expiring soon only
- **WHEN** the expiring-soon filter is Only
- **THEN** only reminders in the critical or expiring-soon state are listed; expired ones are not, and the badge shows 1

#### Scenario: Default
- **WHEN** a segment is opened for the first time
- **THEN** every record of that type is listed and the filter button is not filled

### Requirement: Reminders list order
Each list SHALL be ordered by expiry date, soonest first, with expired reminders first and lifetime reminders last; ties SHALL be broken by name (locale-aware, case-insensitive) and then id. The server API provides no sorting; any user-selectable sort is a client-side concern and not in scope now.

(Scenario unchanged: Order.)

### Requirement: Reminders navigation
The app SHALL have a Reminders tab (the tab bar stays Books, Movies, Reminders, Settings) containing a segmented control with two segments, Subscriptions and Licenses, under the Reminders header; routes `/reminders/subscriptions` and `/reminders/licenses`. Each segment is its own list with its own expiring-soon filter, count and order. The last chosen segment SHALL be remembered per device as local UI state (not synced); the default is Subscriptions. Either list is two taps away (tab, then segment).

#### Scenario: Remembered segment
- **WHEN** the user last viewed Licenses and opens the Reminders tab again on the same device
- **THEN** the Licenses segment is shown

#### Scenario: First open
- **WHEN** the Reminders tab is opened for the first time, or the stored value is unreadable
- **THEN** the Subscriptions segment is shown

## REMOVED Requirements

### Requirement: Type filter and the single combined list
The one list of both types with a type filter (all, subscriptions, licenses) is removed: subscriptions and licenses are two segments of the Reminders tab (owner decision 2026-11-20); the type filter scenario and the "list with type filter" wording of the base spec go with it.

The sentence "a notification is scheduled per the notification rules" of the Create scenario is replaced (above): Phase 6 owns scheduling. The base requirements "Notification time", "Late notification", "Switching to lifetime cancels notification" and "Push delivery" are not changed here. "License key protection" in the base spec (AES-GCM, versioned key) is superseded for now by the MODIFIED text above.

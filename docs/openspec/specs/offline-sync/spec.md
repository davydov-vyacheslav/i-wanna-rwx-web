# offline-sync Specification

Offline-first behaviour for the iOS-limited PWA: no Background Sync, evictable IndexedDB, server authoritative. The client keeps a cache and a mutation outbox; filters, sort and UI state are device-local and not synced.

Facts follow `V001__initial_schema.sql` and `api/openapi.yaml`. Synced resource types are `book`, `movie`, `subscription`, `license`. `POST /api/v1/sync/push` and `GET /api/v1/sync/pull` are in the contract (server handlers and the client engine are the `offline-sync` change); plain REST CRUD remains the first online path.

## Requirements

### Requirement: Offline mode
The app SHALL work offline with cached books, movies, subscriptions and licenses, showing the connection state, and SHALL queue changes in the outbox.

#### Scenario: Go offline
- **WHEN** the network disconnects
- **THEN** the offline indicator is shown, cached data stays viewable and changes are queued

#### Scenario: Back online
- **WHEN** the network reconnects
- **THEN** the online indicator is shown and the outbox is pushed

### Requirement: Client-generated ids and versions
Synced records SHALL use client-generated UUIDs, a server-incremented `version` and a server `updatedAt`.

#### Scenario: Create offline
- **WHEN** a record is created offline
- **THEN** it gets a UUID locally and the same id is used on the server after sync

### Requirement: Mutation outbox
Local changes SHALL be applied optimistically to the cache and appended to a persistent client outbox (id = `mutationId`, operation, resource type, resource id, payload, base version, created at, attempts), sent in order when online. Consecutive unsent upserts of one record MAY be coalesced, latest payload winning.

#### Scenario: Offline edits survive reload
- **WHEN** the user edits while offline and reloads the app
- **THEN** the edit is still visible and queued

#### Scenario: Queue status change offline
- **WHEN** the user marks a book as seen while offline
- **THEN** the change is queued and sent after reconnect

### Requirement: Idempotent push
The server SHALL apply each `mutationId` at most once and return the stored outcome on retry (status, reason, existing id and version; the returned record SHALL be rebuilt from the live row, and the idempotency log SHALL NOT store record bodies, since a license record contains the license key); mutations SHALL be processed in order, each in its own transaction. A domain validation failure SHALL reject only that mutation, which the client moves to a failed list while reverting its cache from the server copy.

#### Scenario: Retry after timeout
- **WHEN** the same mutation is pushed twice
- **THEN** the record changes once and both calls return the same outcome, with the record taken from the current row

#### Scenario: Replay of a license mutation
- **WHEN** a mutation that carried a license key is pushed again
- **THEN** the key is read from the live row and is not present in the stored idempotency result

#### Scenario: Invalid mutation
- **WHEN** one mutation in a batch fails validation
- **THEN** only it is rejected and the others are applied

### Requirement: Last-write-wins
For concurrent writes to one record, the write processed last by the server SHALL win (arrival order, not device clocks); the response SHALL flag a conflict when `baseVersion` was stale and the client SHALL inform the user.

#### Scenario: Two devices
- **WHEN** devices A and B edit the same record offline and A syncs first, then B
- **THEN** B's values are final, version is +2, and B's push is flagged `conflict`

### Requirement: Operations for non-commutative actions
Actions that depend on current state, such as renewal, SHALL be sent as operations carrying the expected state (for example the expected expiry date) and SHALL be a no-op if the state differs; state toggles such as favorite SHALL be sent as state, not as toggles.

#### Scenario: Renewal replayed
- **WHEN** a renewal operation is pushed after the expiry date has already changed
- **THEN** it is a no-op

### Requirement: Deletes
Deletes SHALL be tombstones propagated by pull and SHALL win over concurrent edits; a tombstoned id SHALL NOT be recreated while its tombstone exists. Tombstones SHALL be purged after 90 days; an upsert for an id whose tombstone was purged is accepted as a new record, so a client SHALL complete a full pull after `cursor_expired` before pushing.

#### Scenario: Edit after remote delete
- **WHEN** device B pushes an edit for a record device A deleted
- **THEN** the push is rejected as gone and B removes it locally after pull

### Requirement: Cursor pull
The server SHALL return changes since an opaque cursor, in per-user change order, including tombstones, paginated (page size 200, with next cursor and has-more). The client SHALL apply server rows over its cache except rows with pending outbox entries, which are re-applied on top after push.

#### Scenario: Fresh device
- **WHEN** pull is called without cursor
- **THEN** all live records and recent tombstones are returned in pages

#### Scenario: Expired cursor
- **WHEN** pull is called with a cursor older than the 90-day tombstone retention
- **THEN** the response is 410 with problem code `cursor_expired` and the client discards the cursor, does a full pull and rebuilds its cache before pushing

#### Scenario: Pending local edit
- **WHEN** a pulled row has an unsent local mutation
- **THEN** the local mutation stays visible on top of the server row

### Requirement: Sync triggers
The client SHALL sync on start, on becoming visible, on `online`, after local mutations (debounced), periodically while open, and when a push notification arrives with the app open; it SHALL NOT rely on Background Sync.

#### Scenario: Back online
- **WHEN** the `online` event fires with pending outbox entries
- **THEN** the outbox is pushed, then a pull is done

### Requirement: Eviction recovery
The client SHALL request persistent storage and treat IndexedDB as disposable. When local storage is empty for a logged-in user it SHALL rebuild from a full pull, and SHALL show the last synced time and warn about unsent changes older than 24 hours.

#### Scenario: Evicted DB
- **WHEN** IndexedDB was cleared by the OS
- **THEN** the next app start repopulates it from the server

#### Scenario: Stale outbox
- **WHEN** an unsent change is older than 24 hours
- **THEN** a warning is shown

### Requirement: Per-user isolation
Sync endpoints and the server idempotency records (`applied_mutations.user_id`) SHALL only return and mutate the authenticated user's records; local databases are per user.

#### Scenario: Foreign id
- **WHEN** a push `delete` or `renew` references an id unknown to the caller, including another user's id
- **THEN** the mutation is rejected as `not_found`

#### Scenario: Upsert with another user's id
- **WHEN** a push `upsert` uses an id that belongs to another user
- **THEN** the caller's own record is created (the key is (user_id, id)) and the other user's row is untouched

## Decisions (formerly open)
- Editing one record on two devices offline: last-write-wins with a conflict flag; stricter handling only if conflicts prove common.

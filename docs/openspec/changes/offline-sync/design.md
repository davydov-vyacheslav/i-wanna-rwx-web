# Design: offline-sync

Sources of truth: `V001__initial_schema.sql`, `api/openapi.yaml` (tag `sync`), and `docs/openspec/specs/offline-sync/spec.md`. This document records only the decisions that guide the remaining implementation.

## Records
Synced resource types are `book`, `movie`, `subscription` and `license` (the reminder-bearing types are subscription and license). Each row carries `id` (client UUID), `user_id`, `version` (1 on creation, +1 per accepted write), `updated_at` (server clock), `change_seq` and `deleted_at`. Filters, sort and UI state are device-local and not synced. The license key travels in the `License` inside `SyncChange` (the owner's own data; the client masks it, reminders spec); it is never logged.

## Outbox (client)
Dexie table `outbox` with an auto-increment sequence plus the fields of the contract `Mutation`: `mutationId`, `resourceType`, `resourceId`, `op` (`upsert|delete|renew`), `payload`, `baseVersion`, `expectedExpiryDate`, and bookkeeping `createdAt` and `attempts`. The UI applies each change optimistically to the cache at once. Consecutive unsent upserts of one record may coalesce (latest payload wins); delete and renew are never coalesced. Batches are capped at 100 mutations per push (contract limit).

## Push
`POST /sync/push` processes mutations in order, each in its own transaction, and returns one `MutationResult` per mutation in request order. HTTP 200 unless the request is malformed.
- A seen `mutationId` returns the stored outcome from `applied_mutations` (keyed by user and mutation id, kept 30 days). The `result` column holds only `status`, `conflict`, `reason`, `existingId` and `version`; it never holds the record, because a `License` contains the license key in plaintext and a stored copy would leak it into backups and dumps. On replay `record` is rebuilt from the live row (a tombstone `SyncChange` if the row was deleted since), so a replay may show newer state than the original response; that is correct for a cache update. Concurrent duplicates are resolved by the primary key: the loser reads the winner's outcome.
- `upsert` of an unknown id inserts (the payload is the matching `Create*Request`, the same schema as REST create). For an existing row, LWW: the incoming write is applied, `version` increments, and `conflict=true` is set when `baseVersion` differs from the current version. "Last" means last to arrive at the server. Identical content yields `noop`.
- `delete` writes the tombstone (`deleted_at`) and nulls the sensitive and bulky columns (`license_key`, `description`), which also bumps `change_seq` and `version`. Delete beats a concurrent edit. A repeated delete is a `noop`.
- Upsert of a tombstoned id (younger than the 90-day retention) is rejected with `reason: gone`; the client drops the pending mutation and removes the record after the next pull. `delete` and `renew` of an id unknown to the caller (including another user's id) yield `not_found`, never a distinct signal; an `upsert` with another user's id simply creates the caller's own record, because the key is (user_id, id), and the other user's row is untouched. Once the purge job has removed a tombstone, an upsert for that id is indistinguishable from a create and is accepted as a new record. To keep that from resurrecting a record deleted elsewhere, a client that got `cursor_expired` MUST finish the full pull (which drops local rows the server no longer has) before it pushes anything.
- `renew` (subscription and license only) carries `expectedExpiryDate` and is a `noop` when the current expiry differs; otherwise the server computes the new expiry and recomputes `notifyAt` through the same service as REST. Favorite-like flags are sent as state in an upsert, never as toggles.
- A duplicate (another live item with the same ISBN, source id or draft title) gives `rejected` with reason `duplicate` and `existingId`; the client drops its row and adopts the existing item.
- Validation failure gives `status: rejected` with `validation_failed` (or `immutable_field`) for that mutation only; the client moves it to a failed list and reverts the cache from the returned `record` or the next pull.
- Every result that changed or confirmed state carries `record` (a `SyncChange`) so the client can update its cache without waiting for pull.

## Pull
`GET /sync/pull?cursor=` returns up to 200 `SyncChange` items for the authenticated user in ascending `change_seq` order, with `nextCursor` and `hasMore`; every response, even an empty page, carries a fresh cursor with the current issue time. The cursor is opaque to clients; the server encodes the last returned `change_seq` (a global sequence, filtered by `user_id` through the `(user_id, change_seq)` indexes). Without cursor, the response is all live records plus tombstones younger than the 90-day retention, in pages. Live rows carry exactly one of `book`, `movie`, `subscription`, `license`; tombstones carry none and have `deletedAt`. The client stores `nextCursor` after applying each page and loops while `hasMore`. Server rows are applied over the cache except rows that still have pending outbox entries; those mutations are re-applied on top after push. Within a sync run the order is push, then pull.

## Purge job
Scheduled job removes tombstoned rows with `deleted_at` older than 90 days and `applied_mutations` rows older than 30 days. A device offline longer than 90 days may miss a delete and cannot know it. The cursor carries its issue time, so `GET /sync/pull` answers a cursor older than the retention with 410 and problem `code: cursor_expired`; the client then discards the cursor, does a full pull (no cursor) and rebuilds its cache, and only afterwards pushes. An empty local DB also starts with a full pull. Partial indexes on `deleted_at` (where not null) on the four synced tables serve the tombstone purge. Purging is physical delete and does not need a cursor-visible change.

## When to sync (iOS limits)
On app start, on `visibilitychange` to visible, on `online`, after each local mutation (debounced 1 s), and every 60 s while open. A Web Push arrival with the app open triggers a pull. No background sync. Failures use exponential backoff.

## Eviction
IndexedDB is disposable. On boot, if the DB is empty and the user is logged in, do a full pull. Request `navigator.storage.persist()`. Unsent outbox entries are lost on eviction, so show "last synced at" and warn when the oldest unsent entry is over 24 h old.

## Trade-offs
- Arrival-order LWW vs client-timestamp LWW: arrival order is robust to wrong device clocks; cost: an old offline edit can overwrite a newer edit from another device. Mitigation: `conflict` flag and a toast. Reject-on-stale with a user prompt is more correct but heavier; adopt only if conflicts prove common.
- Whole-record LWW over field merge: simple; concurrent edits to different fields of one record are lost (rare here).
- One `/sync/*` pair vs per-resource REST: sync is the client's main path; REST CRUD remains for the first online implementation and non-offline clients. Both call the same services (no divergent logic, including `notifyAt` recomputation).

## Resolved points (contract and V001 updated)
1. Late commits and the global `change_seq`: pull-side safety window, documented in the `/sync/pull` description. A pull starting from a cursor issued with `hasMore=false` re-reads a margin behind it; mid-run cursors are exact so paging terminates. Clients apply changes idempotently by `(resourceType, id)` and `version` (a tombstone always wins). Media writes additionally serialize per user (see media-core `UserWriteLock`), which makes late commits rare; the window covers the rest. The margin is 30 seconds: the cursor carries its issue time, and a pull from a cursor with `hasMore=false` also returns rows whose `updated_at` is within 30 s before that time. Write transactions are limited to 10 s, so any row that commits late started inside the window. Both numbers are configuration.
2. VAPID: `GET /api/v1/push-subscriptions/vapid-key` (public) returns `{publicKey}`.
3. REST update of a tombstoned id is 410 `gone` (PATCH and create-by-same-id); DELETE of a tombstone is 204; unknown or foreign ids are 404.
4. The server `outbox` table is dropped from V001: the outbox is client-side (IndexedDB) and server idempotency is `applied_mutations`.
5. The idempotency log stores no record (license key leak): see Push. The contract describes this on `MutationResult`.
6. Expired cursor and purged tombstones: 410 `cursor_expired` on pull, full pull before push (see Pull and Purge job). Subscriptions and licenses sync exactly like media: `Create*Request` carries the client `id`, sync `upsert` payloads are those schemas, primary key `(user_id, id)`.

# Change: offline-sync

## Why
The PWA must work offline on iOS (no Background Sync, evictable IndexedDB). Server is authoritative; the client keeps a cache and an outbox of mutations.

## What changes
- Synced resource types: `book`, `movie`, `subscription`, `license`. Every synced row has a client-generated UUID id, a server-incremented `version`, `updatedAt`, a `change_seq` and a `deleted_at` tombstone.
- Mutation outbox in IndexedDB, sent in order, idempotent by `mutationId`; operations are `upsert`, `delete` and `renew` (renew only for subscription and license).
- Pull by opaque cursor; last-write-wins (LWW) per record by arrival order; tombstones for deletes.

## Already in place (not part of the remaining work)
- Schema in `V001__initial_schema.sql`: `version`, `change_seq` (global sequence stamped by a trigger on insert and update), `deleted_at` on the four synced tables, and `applied_mutations`.
- Contract in `api/openapi.yaml`: `POST /api/v1/sync/push` and `GET /api/v1/sync/pull`, with `Mutation`, `MutationResult`, `SyncChange` and the page response. Also `/push-subscriptions` (register, delete) for Web Push.
- Target behaviour in `docs/openspec/specs/offline-sync/spec.md`.

## Impact
Remaining work is server handlers and jobs, and the whole client side (Dexie cache, outbox, sync engine, recovery). Plain REST CRUD stays as the first online path; sync handlers reuse the same services.

## Non-goals
Field-level merge/CRDT, background sync, multi-record transactions. The contract and V001 already carry what this change needs (see resolved points in design).

Spec deltas were folded into `docs/openspec/specs/offline-sync`.

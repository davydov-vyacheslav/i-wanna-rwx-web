# Change: offline-sync

Phase: Offline/PWA (roadmap phase 5). It is no longer part of the next-in-order sequence (`identity-github-oauth`, `media-core`, `media-search`); `media-core` and `media-search` ship online-first and leave a thin `repository.ts` seam for this change.

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
Remaining work is server handlers and jobs, and the whole client side (Dexie cache, outbox, sync engine, recovery). Moved here from `media-core`/`media-search`: the media Dexie stores, the repository bodies that write cache + outbox, offline drafts, offline banners, pending-sync dots, Undo through the outbox, the Dexie cache of search sources, and the backend `MediaMutations` published API used by `/sync/push`. The `/sync/*` endpoints and tables in the contract and V001 are used from this phase on. Plain REST CRUD stays as the first online path; sync handlers reuse the same services.

## Non-goals
Field-level merge/CRDT, background sync, multi-record transactions. The contract and V001 already carry what this change needs (see resolved points in design).

Spec deltas were folded into `docs/openspec/specs/offline-sync`.

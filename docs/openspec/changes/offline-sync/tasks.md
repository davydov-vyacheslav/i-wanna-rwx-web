# Tasks: offline-sync

Done already (not tasks): Flyway columns `version`, `change_seq`, `deleted_at` and `applied_mutations` in V001; OpenAPI `/sync/push`, `/sync/pull` and the mutation, result and change schemas; `/push-subscriptions`.

- [ ] 1. Server push handler: per-mutation transaction, `applied_mutations` idempotency (including concurrent duplicates), LWW + `conflict`, tombstones and `gone`, `renew` no-op rule, per-user isolation (`not_found`), shared with the REST services; `applied_mutations.result` holds only status, conflict, reason, existingId, version and replay rebuilds `record` from the live row (test: no license key in the stored JSON). Integration tests on real Postgres. (backend)
- [ ] 2. Server pull: cursor encode/decode (carries issue time), safety window 30 s with a 10 s write-transaction timeout, page size 200, tombstone retention window, 410 `cursor_expired` for a cursor older than 90 days, per-user scoping, isolation test; plus the purge job for tombstones (90 d) and `applied_mutations` (30 d). (backend)
- [ ] 3. Dexie schema: cache tables per resource type, `outbox`, `meta` (cursor, lastSyncedAt). (frontend)
- [ ] 4. Optimistic mutation layer + outbox writer with coalescing (TanStack Query integration). (frontend)
- [ ] 5. Sync engine: triggers, `cursor_expired` handling (drop cursor, full pull, then push), push-then-pull, cursor paging loop, backoff, failed-mutation list, conflict toast. (frontend)
- [ ] 6. Eviction recovery + `storage.persist()` + stale outbox warning + last synced display. (frontend)
- [ ] 7. Playwright offline suite: offline edit, reload, reconnect, two-context conflict, delete-vs-edit, renew replay. (frontend)
- [ ] 8. Review: idempotency races (concurrent duplicate pushes), cursor/late-commit behaviour (safety window), isolation. (code-reviewer)

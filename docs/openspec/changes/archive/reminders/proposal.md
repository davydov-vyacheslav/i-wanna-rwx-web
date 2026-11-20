# Change: reminders

## Why
Phase 4: subscriptions and licenses, two separate resources shown as two segments of one Reminders tab, online-first like Phase 3: TanStack Query over the API, no Dexie, no outbox, no `/sync/*` (Phase 5). Outcome (exit criteria): fully working subscriptions and licenses including the UI, manual renewal included. Everything about notifications (scheduler, notification time, Web Push, hint) is Phase 6. The reminders spec was fully resolved in Phase 0; the questions this change raised and the owner's answers (2026-11-20) are in `design.md` section 1.

## What changes
- Contract and schema (first backend task, B1): restore from `refs/shelf/full` the paths `/api/v1/subscriptions`, `/{id}`, `/{id}/renew` and the `licenses` twins under tags `subscriptions` and `licenses`, schemas `Subscription`, `License`, `Create*Request`, `Update*Request`, `RenewRequest`, the `AccountExport.subscriptions`/`licenses` arrays, and in V001 the tables `subscriptions` and `licenses` (no `change_seq`, no `license_key_version`), plus two range bounds (design section 3).
- Backend: one module `reminders` with sub-packages `reminders.subscription`, `reminders.license` and `reminders.common` (abstract base entity, repository base and service base with the renewal logic): CRUD with idempotent create by client id, tombstone delete, no-op PATCH writes without version bump, manual renewal with the stale-date guard, account export and deletion. The license key is a plain `license_key` text column, stored and returned in plaintext, never logged.
- Frontend: one new tab, Reminders (tab bar Books, Movies, Reminders, Settings), with a segmented control Subscriptions / Licenses under its header (routes `/reminders/subscriptions`, `/reminders/licenses`, last segment remembered per device, default Subscriptions); each segment is a list with urgency badge, expiring-soon filter (device-local), add/edit sheet, detail with the Renewed action, delete behind a confirmation dialog; licenses add the multi-line key (masked until revealed). Needs a UI design pass first (U1).

## Impact
Capability `reminders` (delta in `specs/reminders`). V001 edited in place (not deployed). No new dependencies, no new configuration.

## Known, accepted trade-off
The license key is plaintext in the database, in API responses, in the in-memory cache, in IndexedDB from Phase 5 and in the `/me/export` file. The owner revisits all of it in the Security/GDPR phase, which must run before the first deploy (V001 is edited in place until then).

## Non-goals
Encryption, key sets and rotation (Security phase); scheduler, notification instant, `notified_at`, Web Push, `push_subscriptions`, the push preference, hint and banner (Phase 6); Dexie, outbox, `mutationId`, `change_seq`, pending dots, Undo, offline editing (Phase 5); a combined list or a type filter; server-side sort or filter; categories, currency fields, attachments.

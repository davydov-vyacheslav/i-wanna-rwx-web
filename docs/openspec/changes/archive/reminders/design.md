# Design: reminders

Sources of truth: `docs/openspec/specs/reminders/spec.md` (mandatory), `docs/REVIEW_LESSONS.md`, `backend/src/main/resources/db/migration/V001__initial_schema.sql`, `api/openapi.yaml`. Layout and flow mirror the archived `media-core` (`docs/openspec/changes/archive/media-core/design.md`). Nothing from reminders exists as code on `refs/shelf/*`: only the contract and the two tables do (`git show refs/shelf/full:api/openapi.yaml`, `...:backend/src/main/resources/db/migration/V001__initial_schema.sql`); services, entities, tests and UI are written new.

## 1. Questions and owner decisions (2026-11-20)

The reminders spec had no open items ("Decisions (formerly open)", ROADMAP Phase 0 decisions 1-6, 9). The design raised the questions below; the owner answered them.

| # | Question | Decision |
|---|---|---|
| Q1 | License key storage and visibility. | Plaintext in a plain `license_key text` column, returned in lists, details and `/me/export`, never logged. No AES-GCM, key set, rotation, `license_key_version` or `RWX_LICENSE_KEYS_*`. A later encrypted column replaces the plain one cheaply. The plaintext key in the DB, caches, IndexedDB (Phase 5) and the export file is a known, accepted trade-off revisited in the Security/GDPR phase (before the first deploy). |
| Q2 | Notifications in Phase 4. | All notification behaviour is Phase 6: no `next_notify_at`/`notified_at`, scheduler, notification-time function or timezone use in the backend. The spec's Notification time, Late notification, Lifetime-cancels and Push requirements stay untouched; the two "notification scheduled" scenarios are reworded. Manual renewal (endpoint and logic) stays in Phase 4. Reason it is cheap: Phase 6 needs only expiry date, remind days, pattern and the user's timezone, all stored. |
| Q3 | Monthly renewal drift (Jan 31, then Feb 28, then Mar 28). | Accepted; no anchor column; kept as a spec scenario. |
| Q4 | Key set and configuration. | Deferred to the Security phase (with Q1). |
| Q5 | Cipher location. | Moot. |
| Q6 | Reminders UI is not designed. | U1 (ui-designer) precedes the frontend tasks. |
| Q7 | Date bounds: yearly renewal of 9999-12-31 gives year 10000, serialized as `+10000-01-01`, which the client cannot parse. | Accepted: expiry year at most 2999, `customRenewalDays` at most 36500; contract bounds the days, the service returns 400 `validation` (field `expiryDate`, also for a renewal result past the bound), V001 CHECKs as backstop; past dates stay valid (the expired badge exists). |
| Q8 | Past expiry on create, `remindDays` for lifetime. | Both allowed; `remindDays` required for every pattern (1..14); the UI sends 3 for a lifetime and hides the field. |
| Q9 | Renew and the license key. | Renew changes only `expiry_date`, `version`, `updated_at`; the key is untouched and returned like on any read. |
| Q10 | Renew order of checks. | Row lock; 404/410; `lifetime`/`none` is 400 (even if the date is stale); a stale `expectedExpiryDate` is a no-op 200 with no `version`/`updatedAt` change; else expiry plus one period, `version` +1. |
| Q11 | Concurrency. | Per-row `@Lock(PESSIMISTIC_WRITE)` read in the write transaction for PATCH, renew, delete (two renews with the same expected date apply once); create inserts and maps a primary key violation to a re-read (200 live, 410 tombstone). No `identity.UserLock` (no cross-row invariant). |
| Q12 | One list or two. | Two resources, two segments of the Reminders tab, two bare-array lists, no paging/filter/sort parameters. The spec's "one list with a type filter" and the type filter are dropped (delta). |
| Q13 | Shared code. | One abstract base for both types inside `reminders.common` (owner decision): `@MappedSuperclass` entity, repository base, service base, with the renewal arithmetic and the 2999 bound. Nothing shared with media (its `MediaEntity` is internal to `media`; Phase 5 extracts a common row base when `change_seq` arrives). |
| Q14 | Client "today" and urgency. | From the stored `UserSettings.timeZone` (Settings feature already loads it), not the device zone: `Intl.DateTimeFormat('en-CA', {timeZone})` gives `YYYY-MM-DD`, day difference by UTC date arithmetic on two such strings. Expiry today is 0 days, critical, not expired. |
| Q15 | Garbled "editable" sentence in the spec. | Replaced: every create field except `id` is editable by PATCH. |
| Q16 | Tags. | `subscriptions` and `licenses` (two generated APIs); the spec's tag `reminders` wording changes. |

## 2. Decisions and trade-offs
| Question | Decision | Why / rejected |
|---|---|---|
| Tables | Two, `subscriptions` and `licenses`, key `(user_id, id)` (spec, shelf schema, Phase 5 resource types). | One table with a nullable key was not chosen; not re-litigated. |
| Write style | `POST` create (client id, idempotent), `PATCH /{id}`, `DELETE /{id}` tombstone, `POST /{id}/renew`. No `PUT`. | As media. |
| Delete | Soft: `deleted_at`, `version` +1, `description` and `license_key` nulled. Delete of a tombstone 204; POST/PATCH/renew of a tombstone 410; reads never return tombstones. | Keeps the Phase 5 tombstone model without a later migration. |
| No-op writes | A PATCH equal to the stored content writes nothing; `version` informational on PATCH, LWW in arrival order. | As media. |
| Clock | `updated_at` from the server `Clock`. | Device clocks untrusted. |
| License key | Plain `license_key text`, plaintext (Q1). | Owner decision; encryption in the Security phase. |
| `Fields.licenseKey` in the shared base | Kept on purpose: one nullable record component that the base never reads (`over` and `valid` drop it; only `LicenseEntity` uses it). | The generic-type alternative (`Fields` parameterized per type) spreads through the service, repository, mappers and controllers for a single field. Revisit when a third type with fields of its own appears. |
| Notification state | None (Q2). | No dead code. |

## 3. Data (V001, in place)
`subscriptions` and `licenses` as in the shelf V001, minus `change_seq` (column, trigger, index) and minus `license_key_version`, plus the Q7 bounds. Columns: `id`, `user_id` (FK users ON DELETE CASCADE), `name text NOT NULL`, `expiry_date date`, `renewal_pattern text NOT NULL`, `custom_renewal_days integer`, `remind_days integer NOT NULL`, `cost text`, `description text`, licenses only `license_key text`, `version bigint NOT NULL DEFAULT 1`, `deleted_at`, `created_at`, `updated_at`. CHECKs: pattern enum, `remind_days` 1..14, `expiry_required` (null only for lifetime), `custom_days_required`, new `custom_renewal_days <= 36500` and `expiry_date <= DATE '2999-12-31'`. Indexes: `(user_id, expiry_date)` (Phase 6 scan, cheap now), the partial `deleted_at` purge index as in media; no `updated_at` index (the list is the full per-user set). Length limits (name 200, cost 100, description 20000, key 10000) live in the contract.

## 4. API (contract restore, exact list for B1)
Tags `subscriptions` and `licenses`. Per type, operation ids `listSubscriptions`, `createSubscription`, `getSubscription`, `updateSubscription`, `deleteSubscription`, `renewSubscription` (license twins).
- `GET /api/v1/subscriptions`: 200 bare array of live records, 401. `POST`: `CreateSubscriptionRequest` (`id, name, remindDays, renewalPattern` required; `expiryDate` nullable, `customRenewalDays` 1..36500, `cost` max 100, `description` max 20000; licenses also `licenseKey` max 10000); 201 created, 200 live id exists (body ignored), 400, 401, 410 `gone`. `GET /{id}`: 200, 401, 404 (a missing, foreign or deleted id; reads never return tombstones). `PATCH /{id}`: `UpdateSubscriptionRequest` (all create properties except `id`, none nullable and no `minProperties`: an absent property is unchanged, so `PATCH {}` is a 200 no-op; `""` clears `cost`, `description` and the license key, `lifetime` clears the expiry date, custom days exist only for `custom`; informational `version`); merged record must be valid (400 `validation`); 200, 401, 404, 410. `DELETE /{id}`: 204 (also for a tombstone), 401, 404. `POST /{id}/renew`: `RenewRequest {expectedExpiryDate}` required; 200 with the record (renewed or stale no-op), 400 (`lifetime`/`none`, or result past the bound), 401, 404, 410.
- Schemas `Subscription`, `License` (`licenseKey` optional string, returned to the owner), `Create*Request`, `Update*Request`, `RenewRequest`. Take the six paths and seven schemas from `refs/shelf/full` (`git show refs/shelf/full:api/openapi.yaml`), changing: tag `reminders` to `subscriptions`/`licenses` (two tag entries replace the `reminders` one), drop every mention of sync, `mutationId`, `applied_mutations`, encryption and `license_key_version`, drop "notification scheduled" wording, `customRenewalDays` `maximum: 36500`.
- `AccountExport`: add required arrays `subscriptions` and `licenses` (licenses include the key).
- `Problem`: no new codes (`validation`, `not_found`, `gone` exist); reuse the `Gone` response.
- The client sends renew with `expectedExpiryDate` equal to the date it shows. Cross-user ids answer 404.

## 5. License key handling
Plain column, mapped straight to `License.licenseKey` (no cipher, no converter). Create and PATCH store a non-blank key, an empty string clears it, absent (or null) leaves it; renew never touches it; delete nulls it. The key never reaches logs: it is excluded from the entity `toString`, Problem responses never echo request values (`ProblemAdvice` already does not), no request-body logging is added; a test captures the log output of a create and a failing create and greps for the key. The Security phase swaps the column for an encrypted one.

## 6. Module layout (Modulith)
- `com.javanix.rwx.reminders`, `@ApplicationModule(displayName = "Reminders", allowedDependencies = {"identity", "common", "api"})`. The root holds only `package-info.java`. Sub-packages, classes package-private:
  - `reminders.common`: abstract `ReminderEntity` (`@MappedSuperclass`: `(user_id, id)` ids, shared columns, `apply(...)` returning whether anything changed, renewal arithmetic (`plusMonths`/`plusYears`/`plusDays`, bound check), `tombstone(now)`, version/`updatedAt` bump), `ReminderKey`, `ReminderRepository<E>` (`@NoRepositoryBean`, extends `Repository`: `findByIdAndUserId`, a `@Lock(PESSIMISTIC_WRITE)` twin, the live list by `userId`, `saveAndFlush`), abstract `ReminderService<E>` (create, get, list, patch, renew, delete; hook `newEntity`; license key handling is a field of `LicenseEntity` applied in its own overrides).
  - `reminders.subscription`: `SubscriptionEntity` (table name), `SubscriptionRepository`, `SubscriptionService` (thin subclass), `SubscriptionController implements SubscriptionsApi`, `SubscriptionApiMapper` (MapStruct), `SubscriptionExport` (`AccountExportContributor`).
  - `reminders.license`: the same set; `LicenseEntity` adds `license_key`, `LicenseService` overrides create/patch for the key.
- Controllers resolve the user with `CurrentUserProvider` like media and pass the user id to the service (no web types in services, which return entities).
- Errors: `common.NotFoundException`, `GoneException`, `InvalidRequestException` already exist; no reminders advice class.
- Architecture: repositories expose no unscoped `findById`/`findAll`/`deleteById`/`existsById`; `ModularityTests` green (`reminders` -> `identity`, `common`, `api` only, not `settings`, not `media`).
- `AccountExportContributor` gets default methods `subscriptions(userId)`, `licenses(userId)`; `AccountService` and its tests get the two arrays.

## 7. Isolation
Every repository method takes `userId`; controllers derive it from the session, never from the body; a foreign id is 404 (create by B with A's id makes B's own row, key is `(user_id, id)`); export and account deletion (FK cascade) cover both tables. Isolation test: B cannot GET/PATCH/DELETE/renew A's records, lists disjoint, same id in two users coexists, A's record is untouched afterwards, export contains only the caller's.

## 8. Frontend design
- One new tab `reminders` in `features/shell/AppShell.tsx` (the bar stays at four items: Books, Movies, Reminders, Settings, matching `docs/design/design-system.md`). Inside it a segmented control Subscriptions / Licenses under the Reminders header; routes `/reminders/subscriptions` and `/reminders/licenses` (the shell currently uses hashes: follow its convention, e.g. `#/reminders/subscriptions`); `/reminders` alone opens the last chosen segment, kept per device and user as local UI state (not synced, corrupt or missing means Subscriptions). Two taps to either list (tab, then segment). U1 designs the control and its placement and updates `design-system.md` only where needed.
- `features/reminders` mirrors `features/media`: `repository.ts` (one seam over the generated client, per type), TanStack hooks per type (mutations update or invalidate the cache, nothing queued, typed errors: `gone`, `validation`, network), pure modules with unit tests `urgency.ts` (Q14), `sort.ts` (spec order, `Intl.Collator(locale, {sensitivity: 'base', numeric: true})`, id tie-break), `filters.ts` (expiring-soon Any/Only/Hide, badge count, reset), `listState.ts` (localStorage per user and list, corrupt means default). A shared list screen, card, add/edit sheet and detail sheet are parameterized by type; license adds the key field (multi-line, masked in the detail until Reveal, masked again on close).
- Screens per segment: each has its own expiring-soon filter state, header count and order; header "<shown> of <total>", card with name, expiry, urgency badge ("2 days", "Expired", "Forever"), cost; FAB add; add/edit sheet (remind days stepper 1..14, custom days field only for `custom`, expiry picker hidden for `lifetime`); detail with Renewed (enabled only for monthly, yearly, custom; sends `expectedExpiryDate`; no optimistic update; toast), edit, delete behind `ConfirmDialog` (no Undo before Phase 5).
- No notification hint, banner or permission flow (Phase 6). Filters work over the in-memory list; offline only from Phase 5.
- i18n keys `reminders.*` (or per tab) in en/ru/uk merged by hand. 44pt targets, safe areas, sidebar from 768px as for media.

## 9. Test plan
Backend, real Postgres (Testcontainers):
- Schema: every CHECK (remind days 0/15, `custom` without days, null expiry for non-lifetime, expiry after 2999, custom days above 36500); `(user_id, id)` lets two users share an id.
- Service: create (201, repeat 200, tombstone 410), PATCH merged validation (lifetime to monthly without a date is 400), identical PATCH keeps version and `updatedAt`, renew table (monthly 2026-03-15 to 2026-04-15, Jan 31 to Feb 28 then Mar 28, yearly Feb 29 to Feb 28, custom 45 days, overdue stays overdue, `none`/`lifetime` 400, stale date no-op 200 with unchanged version, beyond 2999 is 400), concurrent double renew with the same expected date applies once, delete nulls description and key, delete twice 204.
- API (`Api` testkit): every status of the contract per type; license key returned on create, get, list and export; PATCH without `licenseKey` keeps it, blank clears it; account deletion removes both tables' rows; log capture finds no key after a create and a failing create.
- Isolation (section 7), `ModularityTests`, `ArchitectureTests`.
Frontend (Vitest/Testing Library): `urgency` boundaries (-1, 0, 2, 3, 14, 15, lifetime, a zone near midnight), `sort` order from the spec scenario with ru/uk names, `filters` and badge count, corrupt list state, header count, badge text, add/edit rules (custom days only for custom, lifetime hides expiry), detail (key masked until Reveal, Renewed disabled for `none`/`lifetime`, renew body, delete needs confirmation, 410 and network errors). Manual iOS-sized viewport check in the PR.

## 10. For the owner
All questions are decided (section 1). Inconsistencies to be aware of: the spec's single list and type filter are replaced by two segments of the Reminders tab (delta); the spec tag `reminders` becomes `subscriptions`/`licenses`; `design-system.md` keeps its four-tab bar; the spec says the key is encrypted, the delta changes that to plaintext until the Security phase.

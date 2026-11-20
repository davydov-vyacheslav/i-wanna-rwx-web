# Change: push-notifications (Phase 9, after the first deploy; moved on 2026-11-20, not started)

Placeholder that keeps what was taken out of Phase 2 (owner decision 2026-11-18: the push-notifications toggle is not a Phase 2 feature). Nothing here is implemented; `docs/ROADMAP.md` Phase 9 owns it.

## What returns in Phase 9
- Contract and storage: `pushNotificationsEnabled` (boolean, default true) on `UserSettings` and `UpdateSettingsRequest`, column `user_settings.push_notifications_enabled` (a new migration: V001 is frozen after the first deploy, Push is phase 9), `UserSettingsEntity`/`SettingsService` handling, the field in the account export (it is part of the `settings` block), tests.
- `push_subscriptions` table, `POST/DELETE /push-subscriptions`, `GET /push-subscriptions/vapid-key`, `RegisterPushSubscriptionRequest`/`VapidKey`/`PushSubscription`, `push_not_configured` problem code, the idempotent 204 `DELETE` exception to the 404 isolation rule (a subscription id carries no user data), and account deletion removing subscriptions (cascade).
- Frontend: the Notifications switch (`NotificationsSection`, 44pt row, bound to the stored flag, inline error and revert, `settings.notifications*` keys in en/ru/uk, wired between Sources and Language), the browser permission request from a user tap, the subscription flow, the "Blocked" state, the Reminders banner and the one-time hint.
- Install guidance for iOS (PWA phase 5 owns the install flow; Phase 9 gates the switch on it).
- Scheduler, VAPID delivery, notification actions (see `docs/openspec/specs/reminders/spec.md`, mandatory reading).

## Spec delta
`specs/settings/spec.md` holds the requirements moved out of `docs/openspec/specs/settings`.

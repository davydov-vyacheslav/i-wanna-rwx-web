# Change: settings-screen

## Why
Phase 2 (full user settings) re-plan: after sign-in nothing in the UI reaches `/me`, `/me/export`, `DELETE /me` or the timezone and locale stored on the server. The settings spec requires these, and the `datasource` change needs a Settings place for source defaults and the TMDb key. This change builds the Settings screen once (it is the only screen after sign-in in Phase 2), so `datasource` DS-F4 only fills a slot.

## What changes
- Frontend only. Reach: in Phase 2 the app renders the Settings screen directly after sign-in (`App` shows `SettingsScreen` in place of a shell; no router, no tab bar). When `media-core` F8 (Phase 3) adds the bottom tab bar (Books, Movies, Settings), the same screen becomes the Settings tab, one tap from any list.
- Sections: Account (name, avatar, Sign out), Language (en/ru/uk), Timezone (view/change, first-sign-in detection), Account data (Export my data, Delete account with confirmation dialog) and an empty extension slot for "Sources" (filled by `datasource` DS-F4).
- Language: the UI follows the stored `locale` (set at sign-up from the browser language), the device locale only before settings load and on the login page. Timezone auto-detection is narrowed to "stored zone is still the server default `UTC`" (today `useSyncTimeZone` overwrites the stored zone on every sign-in on a device with a different zone).
- Spec delta for `settings` (timezone detection, language and locale, navigation).

## Impact
Capability `settings` (delta). Note: `settings-module` (applied first) removes `PATCH /me` and `Me.timeZone`/`locale`; timezone and language writes use `GET/PATCH /settings`. Remaining contract: `GET /me`, `DELETE /me`, `GET /me/export` and `GET/PATCH /settings`.

## Non-goals
- Everything about notifications (owner decision 2026-11-18): the stored preference flag, the Notifications switch, browser permission request, push subscription, the "Blocked" state and the banner in Reminders belong to the Push phase 6 (`push-notifications`); install guidance and iOS install steps to Offline/PWA phase 5. The Settings shell leaves no placeholder for them beyond normal section ordering.
- Content of the Sources section (`datasource` DS-F4).
- "About" (version and source link): needs the CI version stamp (Ops phase 7).
- Account linking, email/profile editing, in-app theme toggle (design system: follows the OS).
- Dexie, outbox or any offline behaviour: Settings is online-only (a failed request shows an inline error).

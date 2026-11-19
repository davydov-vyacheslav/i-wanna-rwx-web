# Settings module

Phase 2 (user settings and data sources). Order of Phase 2: `settings-module`, `settings-screen`, `datasource-defaults`, `datasource-simplification`, `datasource`.

## Why
Identity owned the user's settings and exposed them in two shapes: `Me` (`timeZone`, `locale`, `PATCH /me`) and `UserSettings` (`/settings`), both writing one `AccountService.update`, with two generated locale enums and a duplicated block in the export. Settings are a capability of their own, and `identity` should answer only "who is the user".

## What changes
- New module `settings` (`com.javanix.rwx.settings`) owns `user_settings`, `GET`/`PATCH /settings`, validation (IANA zone; the locale is the contract enum `UiLocale`), and the published `SettingsService` (returns `UserSettingsView`; `UserTimezones` and `UserTimezoneChangedEvent` return with the reminders module).
- `Me` is `{id, displayName, avatarUrl}`. `PATCH /me` and `UpdateMeRequest` are removed (BREAKING; the client moves timezone and locale writes to `PATCH /settings`).
- `CurrentUser` is `{id}`: the timezone left it (the reminders scheduler will read the zone from settings).
- The settings row is created with defaults (UTC, and the locale given by the event: the browser language at sign-up, `en` if unknown) when the user is, by a listener on `UserCreatedEvent`. `identity` never writes it.
- `GET /me/export` keeps one `settings` block, supplied by `settings` through `AccountExportContributor.settings`.
- Module dependencies: `settings` -> `identity`; `datasource` -> `settings` (TMDb language).
- Also (same change, structural): `DraftLink`, `StrictUrl` and `Text` move from `common` to the published API of `datasource`; `media` already depends on `datasource`. The generic enum converter in `common` is simplified to `ReflectionUtils`.

## Impact
Capabilities `identity` and `settings` (deltas). OpenAPI: `Me` loses two fields, `updateMe` is gone. No migration: `V001` keeps `user_settings` (the push flag column is not part of it (it arrives with the Push phase, see `push-notifications`); only comments changed). Supersedes the `PATCH /me` decision in `settings-screen`.

# Design

- Creation at sign-up: a synchronous `@EventListener` on `UserCreatedEvent` saves the default row in the sign-up transaction (same pattern as `datasource`); `SettingsService.get` reads it and a missing row is a bug (`IllegalStateException`). The row is the only per-user state of the module and is removed by `ON DELETE CASCADE`.
- `UserTimezones` and `UserTimezoneChangedEvent` (first drafts) were removed as having no consumer; the reminders module adds them back with the scheduler.
- Export: identity cannot depend on settings (settings depends on identity), so settings contributes through `AccountExportContributor.settings(userId)`; identity takes the first contribution.
- Problem codes are unchanged (`validation`, `invalid_timezone`); the advice moved to `settings`.
- Shared text rules stay with their only owner: `datasource` publishes `DraftLink`, `StrictUrl`, `Text` (not `internal`) because `media` builds and parses draft links and trims titles with them. This reverses the `common` placement of media-core B12 and media-search 16.5, by owner decision.

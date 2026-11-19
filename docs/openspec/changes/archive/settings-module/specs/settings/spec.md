## MODIFIED Requirements

### Requirement: Settings record
Module `settings` SHALL own one settings record per user (IANA timezone default `UTC`, locale `en`/`ru`/`uk`, never null and taken from `UserCreatedEvent.locale`, the browser language at sign-up (`en` if unknown); the push preference joins it in the Push phase), created when the user is created (timezone `UTC`, the event's locale) (synchronous listener on `identity.UserCreatedEvent`, same transaction), readable and partially updatable by that user only through `GET`/`PATCH /api/v1/settings`. Timezone and locale SHALL be changed only there (`PATCH /me` does not exist). A timezone not in the JDK IANA list SHALL be 400 `invalid_timezone` and an empty body or unsupported locale 400 `validation`, leaving the record unchanged.

#### Scenario: New user
- **WHEN** a user has just signed up and calls `GET /api/v1/settings`
- **THEN** the response is UTC and the sign-up locale (`en` when the browser language was unsupported or absent)

## ADDED Requirements

### Requirement: Published preferences
The module SHALL publish `SettingsService.get(userId)` returning an immutable `UserSettingsView` (the stored locale is never empty; an unknown user is an error) for other modules. `UserTimezones` and `UserTimezoneChangedEvent` are not published yet: they return with the reminders module, the first consumer.

# Settings

Account information, timezone and language. Notification preferences and install guidance are Phase 5 (install) and Phase 9 (notifications) work (`docs/openspec/changes/push-notifications/`). Data sources and the TMDb key are owned by `datasource`.

Contract: `api/openapi.yaml`. Schema: `V001`. Visuals: `docs/design/design-system.md`; flows: `docs/design/INTERACTIONS.md`.

## Requirements

### Requirement: Settings navigation
Settings SHALL be a top-level entry next to Books and Movies (bottom tab bar on phones, left sidebar from 768px; see `media`, Navigation shell), reachable in one tap from any list. Settings SHALL be one screen with the sections Account, Sources, Language and timezone (one group, a row each), App (one row, only while not installed and installing is possible) and Account data in that order. On a wide screen the content column SHALL stay narrow and centered.

#### Scenario: Reach Settings from a list
- **WHEN** the user taps the Settings entry on any list
- **THEN** the Settings screen is shown and the entry is marked current

### Requirement: Account section
Settings SHALL show the signed-in identity read-only (the display name and avatar from `/me`, initials when the avatar is missing or fails to load) and a "Sign out" action. Sign-out semantics belong to identity.

#### Scenario: View account
- **WHEN** the user opens Settings
- **THEN** the name and avatar are shown with a Sign out button

#### Scenario: Sign out
- **WHEN** the user taps Sign out
- **THEN** the session is cleared and the landing page is shown

### Requirement: Account data section
Settings SHALL offer "Export my data" (calls `GET /api/v1/me/export` and downloads the JSON) and "Delete account" (calls `DELETE /api/v1/me`). Delete account SHALL ask for confirmation in a dialog that states the deletion is permanent, and only on confirm delete, clear device-local app state and show the landing page. A failed export or delete SHALL show an inline error and change nothing.

#### Scenario: Export my data
- **WHEN** the user taps Export my data
- **THEN** a JSON file with the user's data is downloaded

#### Scenario: Delete account confirmed
- **WHEN** the user taps Delete account and confirms the dialog
- **THEN** `DELETE /me` is called and the landing page is shown

#### Scenario: Delete account cancelled
- **WHEN** the user taps Delete account and cancels the dialog
- **THEN** nothing is deleted

#### Scenario: Delete fails
- **WHEN** the confirmed `DELETE /me` fails with a network or server error
- **THEN** the dialog stays open with an error and the account is unchanged

### Requirement: Timezone detection
Settings SHALL show the stored timezone and let the user change it (native select of IANA zones, a row of the Language and timezone group; an unknown zone is rejected by the server and the previous value stays). The client SHALL send the device timezone automatically only while the stored zone is still the default `UTC` and the device zone differs, and never overwrites another stored zone; after the user explicitly chooses `UTC` on a device the client SHALL not auto-detect on that device. The stored timezone is what the scheduler uses, not the device's current one.

#### Scenario: First sign-in
- **WHEN** a new user (stored zone `UTC`) opens the app on a device in `Europe/Kyiv`
- **THEN** the stored timezone becomes `Europe/Kyiv`

#### Scenario: Stored zone is kept
- **WHEN** the stored zone is `Europe/London` and the user opens the app on a device in `Asia/Tokyo`
- **THEN** nothing is sent and the stored zone stays `Europe/London`

#### Scenario: Use device timezone
- **WHEN** the device zone differs from the stored one and the user taps "Use this device's timezone"
- **THEN** the stored zone becomes the device zone

#### Scenario: Explicit UTC
- **WHEN** the user selects `UTC` on a device in `Europe/Kyiv` and reopens the app
- **THEN** the stored zone stays `UTC`

#### Scenario: Keep UTC without a change
- **WHEN** the stored zone is `UTC`, the device zone differs and the user taps "Keep UTC on this device"
- **THEN** no request is sent, detection is skipped on this device and the action disappears

### Requirement: Language and locale
The UI language SHALL be the stored user locale (always set, fixed at sign-up from the browser language) once settings are loaded; the device locale (en, ru, uk, English fallback) applies only before they load, if they fail to load, and on the login page; dates, numbers and the sort of titles use `Intl` with that locale. Settings SHALL let the user choose en, ru or uk in a native select (each language named in its own language), stored through `PATCH /settings` (`locale`) and applied at once without reload. Once chosen, the stored locale applies on all devices.

#### Scenario: Russian titles sort with the Russian collator
- **WHEN** the effective locale is `ru` and a list is sorted by title
- **THEN** titles are ordered with the Russian collator

#### Scenario: Russian device
- **WHEN** settings have not loaded yet (or the user is signed out) and the device locale is `ru-RU`
- **THEN** the UI is in Russian

#### Scenario: Choose language
- **WHEN** the user selects Українська in Settings
- **THEN** the UI switches to Ukrainian immediately and `locale=uk` is stored

#### Scenario: Save fails
- **WHEN** the language change request fails
- **THEN** the UI keeps the previous language and shows an inline error

### Requirement: Install row
Settings SHALL show an "App" group with one row, between Language and timezone and Account data, only while the app is not running installed (not `display-mode: standalone` and not `navigator.standalone`) and installing is possible. Where `beforeinstallprompt` was captured the row reads "Install app" and tapping it opens the browser's install prompt once (the row is hidden after a dismissal and on `appinstalled`); on iPhone and iPad without that event it reads "Add to Home Screen" and opens a three-step walkthrough sheet (Share, Add to Home Screen, Add); in any other browser the row is not shown. The event SHALL be captured from app start, not only while Settings is open. The row has no stored state and no server call. Layout and wording: `docs/design/desktop.md` section 11.

#### Scenario: iPhone in Safari
- **WHEN** a user opens Settings on an iPhone in Safari
- **THEN** the "Add to Home Screen" row is shown and opens the three steps

#### Scenario: Android or desktop Chrome
- **WHEN** the browser fired `beforeinstallprompt` before Settings was opened
- **THEN** the "Install app" row is shown and tapping it opens the install prompt once

#### Scenario: Already installed
- **WHEN** the app runs standalone
- **THEN** the row is not shown

#### Scenario: Installed during the session
- **WHEN** `appinstalled` fires
- **THEN** the row disappears

### Requirement: Sources reference
Settings SHALL include a "Sources" section whose behaviour (data sources per resource type, the user's default choice, API keys for sources that need one) is defined by the `datasource` capability ("Sources settings UI"). The section SHALL be an always-visible group inside the Settings screen (no new screen, nothing to expand), and a source that needs no key SHALL show no key control.

#### Scenario: View Sources
- **WHEN** the user opens Settings
- **THEN** behaviour follows `datasource` "Sources settings UI"

#### Scenario: Minimal while nothing can be chosen
- **WHEN** each resource type has a single registered source and the only key-requiring source is TMDb
- **THEN** the section shows the two types with their sources, the TMDb key button (opening the key dialog), and no default control

### Requirement: About
Settings SHALL show the app version and a source code link.

#### Scenario: View about
- **WHEN** the user scrolls to About
- **THEN** version and source link are shown

### Requirement: Per-user isolation
Settings reads and writes SHALL be scoped to the signed-in user, with an isolation test.

#### Scenario: Other user
- **WHEN** user B updates settings
- **THEN** user A's record is unchanged

### Requirement: Settings record
Module `settings` SHALL own one settings record per user (IANA timezone default `UTC`, locale `en`/`ru`/`uk`, never null and taken from `UserCreatedEvent.locale`, the browser language at sign-up (`en` if unknown); the push preference joins it in the Push phase), created when the user is created (timezone `UTC`, the event's locale) (synchronous listener on `identity.UserCreatedEvent`, same transaction), readable and partially updatable by that user only through `GET`/`PATCH /api/v1/settings`. Timezone and locale SHALL be changed only there (`PATCH /me` does not exist). A timezone not in the JDK IANA list SHALL be 400 `invalid_timezone` and an empty body or unsupported locale 400 `validation`, leaving the record unchanged.

#### Scenario: New user
- **WHEN** a user has just signed up and calls `GET /api/v1/settings`
- **THEN** the response is UTC and the sign-up locale (`en` when the browser language was unsupported or absent)

#### Scenario: Update timezone
- **WHEN** the user changes the timezone to `Europe/London`
- **THEN** it is stored and used by the reminder scheduler for 09:00 local

#### Scenario: Invalid timezone
- **WHEN** an unknown IANA id is submitted
- **THEN** the response is 400 and nothing changes

### Requirement: Published preferences
The module SHALL publish `SettingsService.get(userId)` returning an immutable `UserSettingsView` (the stored locale is never empty; an unknown user is an error) for other modules. `UserTimezones` and `UserTimezoneChangedEvent` are not published yet: they return with the scheduler in Phase 9 (the reminders module of Phase 4 does not use the stored timezone on the server).

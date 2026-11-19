# Delta: settings (settings-screen)

## ADDED Requirements

### Requirement: Settings navigation
After sign-in the app SHALL show the Settings screen directly while it is the only screen (Phase 2; the tab bar arrives in Phase 3, see `media-core`). Settings SHALL be one screen with the sections Account, Sources, Language and timezone (one group, a row each) and Account data in that order. On a wide screen the content column SHALL stay narrow and centered.

#### Scenario: First screen after sign-in
- **WHEN** a user signs in and no list screens exist yet
- **THEN** the Settings screen is shown with no tab bar

## MODIFIED Requirements

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
The UI language SHALL be the stored user locale (always set, fixed at sign-up from the browser language) once settings are loaded; the device locale (en, ru, uk, English fallback) applies only before they load, if they fail to load, and on the login page; dates, numbers and sorting use `Intl` with that locale. Settings SHALL let the user choose en, ru or uk in a native select (each language named in its own language), stored through `PATCH /settings` (`locale`) and applied at once without reload. Once chosen, the stored locale applies on all devices.

#### Scenario: Russian device
- **WHEN** settings have not loaded yet (or the user is signed out) and the device locale is `ru-RU`
- **THEN** the UI is in Russian

#### Scenario: Choose language
- **WHEN** the user selects Українська in Settings
- **THEN** the UI switches to Ukrainian immediately and `locale=uk` is stored

#### Scenario: Save fails
- **WHEN** the language change request fails
- **THEN** the UI keeps the previous language and shows an inline error

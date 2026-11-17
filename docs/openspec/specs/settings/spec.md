# Settings

Account information, timezone, notification preferences, install guidance and language. Provider sources and the TMDb token are owned by `search` (see "Sources list and settings UI").

Contract: `api/openapi.yaml`. Schema: `V001`. Visuals: `docs/design/design-system.md`; flows: `docs/design/INTERACTIONS.md`.

## Requirements

### Requirement: Account section
Settings SHALL show the signed-in identity read-only (provider login or email as known to the server) and a "Sign out" action. Sign-out semantics belong to identity.

#### Scenario: View account
- **WHEN** the user opens Settings
- **THEN** the identity is shown with a Sign out button

#### Scenario: Sign out
- **WHEN** the user taps Sign out
- **THEN** the session is cleared and the landing page is shown

### Requirement: Account data section
Settings SHALL offer "Export my data" (calls `GET /api/v1/me/export` and downloads the JSON) and "Delete account" (calls `DELETE /api/v1/me`). Delete account SHALL ask for confirmation in a dialog that states the deletion is permanent, and only on confirm sign the user out and show the landing page.

#### Scenario: Export my data
- **WHEN** the user taps Export my data
- **THEN** a JSON file with the user's data is downloaded

#### Scenario: Delete account confirmed
- **WHEN** the user taps Delete account and confirms the dialog
- **THEN** `DELETE /me` is called and the landing page is shown

#### Scenario: Delete account cancelled
- **WHEN** the user taps Delete account and cancels the dialog
- **THEN** nothing is deleted

### Requirement: User settings record
Each user SHALL have exactly one settings record holding IANA timezone (default `UTC`), optional locale and the push-enabled flag, readable and partially updatable by that user only. The record SHALL carry no secrets.

#### Scenario: Update timezone
- **WHEN** the user changes the timezone to `Europe/London`
- **THEN** it is stored and used by the reminder scheduler for 09:00 local

#### Scenario: Invalid timezone
- **WHEN** an unknown IANA id is submitted
- **THEN** the response is 400 and nothing changes

### Requirement: Timezone detection
On first sign-in the client SHALL send the device timezone; Settings SHALL let the user change it. The user's timezone SHALL be what the scheduler uses, not the device's current one.

#### Scenario: First sign-in
- **WHEN** a new user signs in from a device in `Europe/Kyiv`
- **THEN** the stored timezone is `Europe/Kyiv`

### Requirement: Notifications setting
Enabling push SHALL request browser permission only from a user tap; on grant the push subscription is sent to the server and the stored flag is set. Disabling SHALL stop pushes: `PATCH /settings` with `pushNotificationsEnabled=false` deletes all of the user's push subscriptions server-side. When permission is not granted, Reminders SHALL show a banner linking to Settings and reminders SHALL stay fully usable. When permission is denied, Settings SHALL show "Blocked" with instructions for the system settings (the app cannot re-prompt); granting later catches up pending notifications.

#### Scenario: Enable
- **WHEN** the user toggles notifications on and grants permission
- **THEN** the subscription is stored and reminders send Web Push

#### Scenario: Disable
- **WHEN** the user toggles notifications off
- **THEN** pushes stop and the Reminders banner shows notifications are disabled

#### Scenario: Denied
- **WHEN** the browser permission is denied
- **THEN** Settings shows "Blocked" and how to change it in system settings

### Requirement: Install guidance
On iOS, when the app is not installed to the Home Screen, Settings SHALL explain that push requires the installed app (iOS 16.4+) and open the short install steps; notification controls SHALL be unavailable until installed.

#### Scenario: Not installed
- **WHEN** the user opens Settings in Safari on iOS
- **THEN** the install explanation and steps are shown and the toggle is inert

### Requirement: Language and locale
The UI language SHALL follow the device locale (en, ru, uk, English fallback); dates, numbers and sorting use `Intl` with that locale. The locale MAY be stored in the user settings for server-side messages.

#### Scenario: Russian device
- **WHEN** the device locale is `ru-RU`
- **THEN** the UI is in Russian and titles sort with the Russian collator

### Requirement: Sources reference
Settings SHALL include a "Sources" section whose behaviour (Open Library, TMDb token) is defined by the `search` capability.

#### Scenario: Open Sources
- **WHEN** the user opens Sources
- **THEN** behaviour follows `search` "Sources list and settings UI"

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

## Decisions (formerly open)
- Disabling push in Settings clears the server-side flag and, in the same PATCH, deletes all of the user's push subscriptions; the browser permission cannot be revoked by the app and stays as it is.

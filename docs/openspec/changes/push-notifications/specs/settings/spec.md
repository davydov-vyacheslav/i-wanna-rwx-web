# Delta: settings (push-notifications, FUTURE, Phase 9)

Moved out of the current `settings` spec because the tree has no push flag, push subscription or install flow.

## ADDED Requirements

### Requirement: Push preference in the settings record
The settings record SHALL also hold the push-enabled flag (default true), readable and partially updatable through `GET`/`PATCH /api/v1/settings` (`pushNotificationsEnabled`).

#### Scenario: Toggle off
- **WHEN** the user switches Notifications off
- **THEN** `PATCH /settings {pushNotificationsEnabled:false}` is sent and the switch shows off

#### Scenario: Save fails
- **WHEN** the request fails
- **THEN** the switch reverts and an inline error is shown

### Requirement: Notifications setting
Enabling push SHALL request browser permission only from a user tap; on grant the push subscription is sent to the server and the stored flag is set. Disabling SHALL stop pushes: `PATCH /settings` with `pushNotificationsEnabled=false` deletes all of the user's push subscriptions server-side (the browser permission cannot be revoked by the app and stays as it is). When permission is not granted, Reminders SHALL show a banner linking to Settings and reminders SHALL stay fully usable. When permission is denied, Settings SHALL show "Blocked" with instructions for the system settings (the app cannot re-prompt); granting later catches up pending notifications.

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

# Delta: settings (pwa-install)

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Settings navigation
Settings SHALL be a top-level entry next to Books and Movies (bottom tab bar on phones, left sidebar from 768px; see `media`, Navigation shell), reachable in one tap from any list. Settings SHALL be one screen with the sections Account, Sources, Language and timezone (one group, a row each), App (one row, only while not installed and installing is possible) and Account data in that order. On a wide screen the content column SHALL stay narrow and centered.

#### Scenario: Reach Settings from a list
- **WHEN** the user taps the Settings entry on any list
- **THEN** the Settings screen is shown and the entry is marked current

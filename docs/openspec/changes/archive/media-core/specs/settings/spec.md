# Delta: settings (media-core)

Phase 3 scenarios moved out of `settings-screen` (Phase 2), where nothing could test them: the tab bar and the lists do not exist yet.

## MODIFIED Requirements

### Requirement: Settings navigation
Once the lists exist, Settings SHALL be a top-level tab of the bottom tab bar (Books, Movies, Settings), reachable in one tap from any list; the Settings screen itself is unchanged.

#### Scenario: Reach Settings from a list
- **WHEN** the tab bar exists and the user taps the Settings tab on any list
- **THEN** the Settings screen is shown and the tab is marked current

### Requirement: Language and locale
Dates, numbers and the sort of titles SHALL use `Intl` with the effective UI locale.

#### Scenario: Russian titles sort with the Russian collator
- **WHEN** the effective locale is `ru` and a list is sorted by title
- **THEN** titles are ordered with the Russian collator

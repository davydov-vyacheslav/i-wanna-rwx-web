# Delta: settings (datasource, Sources section)

Builds on `docs/openspec/changes/settings-screen/specs/settings/spec.md` (the Sources slot of the Settings screen, Phase 2).

## MODIFIED Requirements

### Requirement: Sources reference
Settings SHALL include a "Sources" section whose behaviour (data sources per resource type, the user's default choice, API keys for sources that need one) is defined by the `datasource` capability ("Sources settings UI"). The section SHALL be an always-visible group inside the Settings screen (no new screen, nothing to expand), and a source that needs no key SHALL show no key control.

#### Scenario: View Sources
- **WHEN** the user opens Settings
- **THEN** behaviour follows `datasource` "Sources settings UI"

#### Scenario: Minimal while nothing can be chosen
- **WHEN** each resource type has a single registered source and the only key-requiring source is TMDb
- **THEN** the section shows the two types with their sources, the TMDb key button (opening the key dialog), and no default control

# Tasks

- [x] B1 OpenAPI: drop `PATCH /me`, `UpdateMeRequest`, `Me.timeZone`, `Me.locale`.
- [x] B2 Module `settings`: entity, repository, `SettingsService`, `UserSettingsListener` (default row at sign-up), controller, mapper, problem advice, published `SettingsService` and `UserSettingsView`, export contributor. `UserTimezones` and `UserTimezoneChangedEvent` return with reminders.
- [x] B3 Identity: remove settings code, `CurrentUser(id)`, `Me` mapper, export via contributors.
- [x] B4 Move `DraftLink`, `StrictUrl`, `Text` (and tests) to `datasource`; simplify `ContractEnumConverters`.
- [x] B5 Tests: settings API and isolation, default row at sign-up, identity and security tests adjusted. Full backend suite green.
- [x] F1 Frontend: settings hook over `/settings`, remove `useUpdateMe` and `Me.timeZone`/`locale` use (done in `features/settings/useSettings.ts`; checked in the tree: no `useUpdateMe`).
- [x] D1 After merge: fold the deltas into `docs/openspec/specs/{identity,settings}` and archive (Phase 2, with `settings-screen` and `datasource`).

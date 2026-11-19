# Tasks: datasource-defaults

- [x] B1 Properties: `Sources.defaultSource` bound from `default`; `application.yaml` defaults; `SourceDirectory` validation and `defaultOf(type)`; javadoc.
- [x] B2 identity: `UserCreatedEvent` published from `AccountService.loginOrCreate` for a new user.
- [x] B3 datasource: `UserCreatedListener`, `UserDataSourceService.createDefaults`, `UserDefaultSourceRepository.save`; called only by the listener.
- [x] B4 Derivation falls back to the configured default; `setDefault` and `deleteKey` keep one default per type (primary key).
- [x] B5 V001 comments fixed in place (later replaced by the two-table schema, `datasource` design 16.2).
- [x] B6 Tests: sign-up creates both rows, `TestUsers` publishes the same event, parallel create, one default per type through default and key changes, property binding and validation, existing tests adjusted (service, API, export, schema comment).
- [x] B7 Docs: media-search change, ROADMAP, CLAUDE.md, TODO, OpenAPI descriptions.

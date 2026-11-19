# Design: datasource-defaults

- Event: `com.javanix.rwx.identity.UserCreatedEvent(UUID userId)`, published after the user and credential rows are flushed. The listener (`datasource.internal.provider.UserCreatedListener`) is a plain `@EventListener`, so it runs in the sign-up transaction and a failure rolls the user back. `datasource` already may depend on `identity`; identity knows nothing about sources.
- Insert: plain `save` of one `UserDefaultSourceEntity` per type in the sign-up transaction (a new user has no rows, so nothing can conflict).
- `createDefaults` runs only from the sign-up listener. Derived state never writes. A user without rows (not reachable in production) still gets the configured default by derivation.
- `SourceDirectory.defaultOf(type)` is validated at startup; null only when a type has no registered source.
- `setDefault` saves the row `(user, type)`; `deleteKey` touches only `user_source_keys`, so the default row stays.
- The old specs under `docs/openspec/specs` do not state the lazy rule, so there is no MODIFIED delta; the not yet archived `datasource` design (formerly `media-search`), spec, proposal and tasks, `ROADMAP.md`, `CLAUDE.md` and the OpenAPI descriptions were corrected in place.
- Update (storage redesign, `datasource` design 16.2): the default and the keys are two tables, so no advisory lock, row lock, partial index, "not empty" CHECK or retry exists any more; the primary keys carry the invariants.

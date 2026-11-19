# Proposal: datasource-defaults

Phase 2 (user settings and data sources); part of the `datasource` capability work.

## Why
Owner decision: every user has exactly one default data source per resource type (book, movie), stored at user creation. Until now the default rows were lazy and "no row" meant "the first listed source", which tied the default to list order and left the default implicit.

## What changes
- `rwx.datasource.books.default` / `rwx.datasource.movies.default` (YAML key `default`) name the default per type; it must be one of the listed ids (startup fails otherwise); unset = the first listed source. `application.yaml` sets `open_library` and `tmdb`.
- `identity` publishes `UserCreatedEvent(userId)` from `AccountService.loginOrCreate` inside the sign-up transaction.
- `datasource` listens synchronously and saves one default row per type (table `user_default_sources`). The sign-up event is the only path that creates the rows (`UserDataSourceService.createDefaults`); no read repairs missing rows, since no data predates this change. Test users get their rows through the same event (`TestUsers`).
- Derivation: the default is the stored row of the type; if there is none or its source is no longer registered, the configured default applies. `effective` is unchanged.
- Storage (updated by the redesign in `datasource` design 16.2): `user_default_sources` with primary key `(user_id, resource_type)`; keys are in `user_source_keys`.

## Not changed
No API shape change (only description texts in `api/openapi.yaml`). The primary key of `user_default_sources` guarantees one default per (user, type).

# Provider fixtures

Responses the provider tests serve from WireMock (the only stub allowed; external HTTP only).

- `open_library/`: RECORDED real responses from openlibrary.org, 2026-11-18, with `User-Agent: RWX-dev-fixtures (local development)`.
  Trimmed only (long `isbn`, `covers`, `subjects` lists cut to their first entries, unused keys dropped); values are untouched.
  `work-404.json` is the real body of a 404 (`/works/OL99999999W.json`).
- `tmdb/synthetic/`: NOT recorded. Hand-written from the public TMDb API v3 documentation (see its README).

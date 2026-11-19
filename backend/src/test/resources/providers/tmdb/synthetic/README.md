# TMDb fixtures: synthetic, not recorded

These files are hand-written from the public TMDb API v3 documentation (`/configuration`, `/search/multi`,
`/movie/{id}`, `/tv/{id}`, `/authentication` and the documented error bodies). They are NOT recorded responses. They must
be replaced by recorded responses when the owner has a TMDb key (record a handful of requests, trim, keep real values,
note the recording date here). Titles and ids are real catalogue entries but every field value was typed by hand, so a
mismatch with the live API (extra fields, formatting) would not be caught by these tests.

Edge cases covered on purpose: movie without poster and with an empty overview, tv `status` of `Ended`, `Canceled`,
`Returning Series` and `null`, a person among the multi-search results, the 401 and 404 bodies. A 429 is a status plus a
`Retry-After` header and has no fixture body.

-- ============================================================================
-- RWX Initial Schema
-- Created: 2026-11-16
-- ============================================================================

-- ============================================================================
-- users: User account (created on first credential authentication)
-- ============================================================================
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

-- ============================================================================
-- credentials: Login credentials (GitHub)
-- ============================================================================
CREATE TABLE credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  external_id text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT valid_type CHECK (type IN ('github')),
  CONSTRAINT unique_credential UNIQUE (type, external_id)
);

CREATE INDEX idx_credentials_user_id ON credentials(user_id);
CREATE INDEX idx_credentials_created_at ON credentials(created_at DESC);

-- ============================================================================
-- books: User's book library (Open Library items and drafts)
-- ============================================================================
CREATE TABLE books (
  id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text,
  year integer,
  rating decimal(2,1),
  status text NOT NULL DEFAULT 'planned',
  is_favorite boolean NOT NULL DEFAULT false,
  description text,
  cover_url text,
  isbn text,
  source text NOT NULL,
  external_id text NOT NULL,
  external_link text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT valid_status CHECK (status IN ('planned', 'seen')),
  CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT valid_book_source CHECK (source IN ('draft', 'open_library')),
  CONSTRAINT valid_book_external_id_length CHECK (char_length(external_id) BETWEEN 1 AND 1024),
  CONSTRAINT valid_book_external_link_length CHECK (char_length(external_link) <= 4096),
  CONSTRAINT valid_book_cover_url_length CHECK (char_length(cover_url) <= 4096),
  CONSTRAINT valid_open_library_id CHECK (source <> 'open_library' OR external_id ~ '^OL[0-9]{1,12}W$')
);

-- Duplicate rules over live rows only (tombstones never block re-adding). See column comments for what an index cannot express.
CREATE UNIQUE INDEX uq_books_user_isbn ON books(user_id, isbn)
  WHERE deleted_at IS NULL AND isbn IS NOT NULL;
CREATE UNIQUE INDEX uq_books_user_source_external_id ON books(user_id, source, external_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_books_updated_at ON books(user_id, updated_at DESC);
CREATE INDEX idx_books_deleted_at ON books(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- movies: User's movies and TV shows library (TMDb items and drafts)
-- ============================================================================
CREATE TABLE movies (
  id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  original_title text,
  year integer,
  rating decimal(3,1),
  type text NOT NULL,
  season_count integer,
  tv_status text,
  status text NOT NULL DEFAULT 'planned',
  is_favorite boolean NOT NULL DEFAULT false,
  description text,
  poster_url text,
  source text NOT NULL,
  external_id text NOT NULL,
  external_link text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT valid_type CHECK (type IN ('movie', 'tv')),
  CONSTRAINT valid_status CHECK (status IN ('planned', 'seen')),
  CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 10),
  CONSTRAINT valid_tv_status CHECK (tv_status IN ('ongoing', 'ended')),
  CONSTRAINT valid_movie_source CHECK (source IN ('draft', 'tmdb')),
  CONSTRAINT valid_movie_external_id_length CHECK (char_length(external_id) BETWEEN 1 AND 1024),
  CONSTRAINT valid_movie_external_link_length CHECK (char_length(external_link) <= 4096),
  CONSTRAINT valid_movie_poster_url_length CHECK (char_length(poster_url) <= 4096),
  CONSTRAINT valid_tmdb_id CHECK (source <> 'tmdb' OR external_id ~ '^[1-9][0-9]{0,9}$'),
  CONSTRAINT valid_draft_movie_type CHECK (source <> 'draft' OR type = 'movie')
);

-- Duplicate rules over live rows only. TMDb movie and tv ids are separate namespaces, hence type in the key.
CREATE UNIQUE INDEX uq_movies_user_source_type_external_id ON movies(user_id, source, type, external_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_movies_updated_at ON movies(user_id, updated_at DESC);
CREATE INDEX idx_movies_deleted_at ON movies(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- subscriptions: Recurring subscriptions (renewal reminders)
-- ============================================================================
CREATE TABLE subscriptions (
  id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  expiry_date date,
  renewal_pattern text NOT NULL,
  custom_renewal_days integer,
  remind_days integer NOT NULL,
  cost text,
  description text,
  version bigint NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT valid_pattern CHECK (renewal_pattern IN ('monthly', 'yearly', 'lifetime', 'custom', 'none')),
  CONSTRAINT valid_remind_days CHECK (remind_days >= 1 AND remind_days <= 14),
  CONSTRAINT expiry_required CHECK (renewal_pattern = 'lifetime' OR expiry_date IS NOT NULL),
  CONSTRAINT custom_days_required CHECK (renewal_pattern <> 'custom' OR COALESCE(custom_renewal_days, 0) > 0),
  CONSTRAINT valid_custom_renewal_days CHECK (custom_renewal_days <= 36500),
  CONSTRAINT valid_expiry_year CHECK (expiry_date <= DATE '2999-12-31')
);

CREATE INDEX idx_subscriptions_user_expiry_date ON subscriptions(user_id, expiry_date);
CREATE INDEX idx_subscriptions_deleted_at ON subscriptions(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- licenses: Licenses (renewal reminders, optional license key)
-- ============================================================================
CREATE TABLE licenses (
  id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  expiry_date date,
  renewal_pattern text NOT NULL,
  custom_renewal_days integer,
  remind_days integer NOT NULL,
  cost text,
  description text,
  license_key text,
  version bigint NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT valid_pattern CHECK (renewal_pattern IN ('monthly', 'yearly', 'lifetime', 'custom', 'none')),
  CONSTRAINT valid_remind_days CHECK (remind_days >= 1 AND remind_days <= 14),
  CONSTRAINT expiry_required CHECK (renewal_pattern = 'lifetime' OR expiry_date IS NOT NULL),
  CONSTRAINT custom_days_required CHECK (renewal_pattern <> 'custom' OR COALESCE(custom_renewal_days, 0) > 0),
  CONSTRAINT valid_custom_renewal_days CHECK (custom_renewal_days <= 36500),
  CONSTRAINT valid_expiry_year CHECK (expiry_date <= DATE '2999-12-31')
);

CREATE INDEX idx_licenses_user_expiry_date ON licenses(user_id, expiry_date);
CREATE INDEX idx_licenses_deleted_at ON licenses(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- user_settings: User preferences (locale, timezone)
-- ============================================================================
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ru', 'uk')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- user_default_sources: the user's chosen default source per resource type. user_source_keys: the user's API keys.
-- ============================================================================
CREATE TABLE user_default_sources (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  source text NOT NULL,
  PRIMARY KEY (user_id, resource_type),
  CONSTRAINT valid_user_default_source CHECK (
    (resource_type = 'book' AND source IN ('open_library')) OR
    (resource_type = 'movie' AND source IN ('tmdb')))
);

CREATE TABLE user_source_keys (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('tmdb')),
  api_key text NOT NULL CHECK (char_length(api_key) BETWEEN 1 AND 512),
  PRIMARY KEY (user_id, source)
);

-- ============================================================================
-- Spring Session JDBC (spring-session-jdbc 4.1.1, schema-postgresql.sql, verbatim).
-- Not user-owned data: sessions reference users only by PRINCIPAL_NAME.
-- Used with spring.session.jdbc.initialize-schema=never; Hibernate does not map these.
-- On a Spring Boot upgrade that bumps spring-session, diff against the new jar's DDL.
-- ============================================================================
CREATE TABLE SPRING_SESSION (
	PRIMARY_ID CHAR(36) NOT NULL,
	SESSION_ID CHAR(36) NOT NULL,
	CREATION_TIME BIGINT NOT NULL,
	LAST_ACCESS_TIME BIGINT NOT NULL,
	MAX_INACTIVE_INTERVAL INT NOT NULL,
	EXPIRY_TIME BIGINT NOT NULL,
	PRINCIPAL_NAME VARCHAR(100),
	CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
	SESSION_PRIMARY_ID CHAR(36) NOT NULL,
	ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
	ATTRIBUTE_BYTES BYTEA NOT NULL,
	CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
	CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);

-- ============================================================================
-- Table & Column Comments
-- ============================================================================

COMMENT ON TABLE users IS 'User account identity. Created on first successful credential authentication. Display name and avatar from credentials/session only.';
COMMENT ON COLUMN users.disabled_at IS 'Soft-disable timestamp. If set, user cannot log in. For future audit.';

COMMENT ON TABLE credentials IS 'Login credentials. Supports GitHub OAuth; one row per credential, so other types can be added by relaxing the CHECK. Contains identity data: display_name, avatar_url (not stored in users table).';
COMMENT ON COLUMN credentials.type IS 'Credential type. CHECK: github.';
COMMENT ON COLUMN credentials.external_id IS 'External identifier: GitHub numeric ID. Unique per type.';
COMMENT ON COLUMN credentials.data IS 'Credential metadata (JSONB). GitHub: login, avatar_url, name. Never encrypted (identity data).';
COMMENT ON COLUMN credentials.last_used_at IS 'Timestamp of last successful authentication with this credential.';

COMMENT ON TABLE user_settings IS 'Per-user preferences: locale, timezone. Exactly one row per user, created at sign-up (timezone UTC, locale from the client) by the settings module listener on UserCreatedEvent (same transaction as the user).';
COMMENT ON COLUMN user_settings.timezone IS 'IANA timezone (e.g., Europe/London). Used by scheduler for reminder notifications at local time.';
COMMENT ON COLUMN user_settings.locale IS 'UI language: en, ru or uk. Fixed at sign-up from the browser (Accept-Language reduced to its language, en when unknown), changeable in settings; never NULL. Used for i18n on client and for the language of provider calls (TMDb).';

COMMENT ON TABLE user_default_sources IS 'Per user and resource type, the source the user chose as default: stored at sign-up from the configured default (datasource module listener on UserCreatedEvent, same transaction as the user), replaced when the user picks another source. The primary key guarantees one default per type. Kept when the source becomes unavailable (key deleted): searches then fall back to the first available source.';
COMMENT ON COLUMN user_default_sources.resource_type IS 'book or movie (movie covers TV).';
COMMENT ON COLUMN user_default_sources.source IS 'Registered source id, per resource type: book open_library, movie tmdb (never draft: a draft is not a data source). Extending the list is an ALTER of valid_user_default_source.';

COMMENT ON TABLE user_source_keys IS 'The API key a user saved for a source that needs one (tmdb). Stored as is for now (owner decision: no encryption yet), so DB dumps and backups contain them in clear. Never returned to the client, never logged.';
COMMENT ON COLUMN user_source_keys.source IS 'Registered source id that requires a key. Extending the list is an ALTER of the CHECK.';

COMMENT ON TABLE books IS 'User book library. Identity of every item, a draft included, is (source, external_id); duplicate rules (media spec) among live rows: same isbn, or same (source, external_id). A draft external_id is its normalized title key (NFC, trimmed, case-folded; computed by the service, not reproducible in SQL), so two live drafts of one title are blocked by uq_books_user_source_external_id. A draft title that equals the title of a non-draft item is not an index and is checked by the service under the per-user write lock.';
COMMENT ON COLUMN books.id IS 'Client-generated UUID, unique per user only: the key is (user_id, id), so ids of different users cannot collide.';
COMMENT ON COLUMN books.isbn IS 'Normalized ISBN (no hyphens or spaces, uppercase X), first ISBN of the search hit. NULL for drafts. Immutable. Unique per user among live rows (uq_books_user_isbn); the service normalizes before storing.';
COMMENT ON COLUMN books.source IS 'Where the item came from, closed list: draft (the user''s typed text, nothing fetched) or open_library. Immutable. Extending the list is an ALTER of valid_book_source.';
COMMENT ON COLUMN books.external_id IS 'Provider id (Open Library work id OL<digits>W) or, for a draft, the normalized title key (TitleKey: NFC, trimmed, case-folded). Never NULL. Immutable. With source it is the identity, unique per user among live rows (uq_books_user_source_external_id).';
COMMENT ON COLUMN books.external_link IS 'Canonical URL built by the server: the Open Library work page, or for a draft the Google search link of its title. Only where a tap goes and what the client compares by string; not an identity. Never NULL, at most 4096 characters. Immutable.';
COMMENT ON COLUMN books.version IS 'Server-incremented bigint, 1 on creation, +1 per accepted change. Last write wins; informational for clients.';
COMMENT ON COLUMN books.deleted_at IS 'Tombstone (description is nulled on delete). Hidden from reads, purged after 90 days. A tombstoned id is never recreated.';
COMMENT ON TABLE movies IS 'User movies and TV shows library. Identity of every item, a draft included, is (source, type, external_id); duplicate rule (media spec) among live rows: same (source, type, external_id). A draft external_id is its normalized title key (NFC, trimmed, case-folded; computed by the service), so two live drafts of one title are blocked by uq_movies_user_source_type_external_id. A draft title that equals the title or original_title of a non-draft item is not an index and is checked by the service under the per-user write lock.';
COMMENT ON COLUMN movies.id IS 'Client-generated UUID, unique per user only: the key is (user_id, id), so ids of different users cannot collide.';
COMMENT ON COLUMN movies.original_title IS 'Original-language title from TMDb. Optional.';
COMMENT ON COLUMN movies.tv_status IS 'TV only: ongoing or ended (TMDb Ended and Canceled map to ended). NULL = unknown or not tv.';
COMMENT ON COLUMN movies.type IS 'movie or tv. CHECK constraint enforces valid values.';
COMMENT ON COLUMN movies.season_count IS 'Number of seasons. For TV shows only. NULL for movies.';
COMMENT ON COLUMN movies.source IS 'Where the item came from, closed list: draft (the user''s typed text, nothing fetched; type is always movie) or tmdb. Immutable. Extending the list is an ALTER of valid_movie_source.';
COMMENT ON COLUMN movies.external_id IS 'Provider id (TMDb id, digits) or, for a draft, the normalized title key (TitleKey). Never NULL. Immutable. With source and type it is the identity, unique per user among live rows (uq_movies_user_source_type_external_id).';
COMMENT ON COLUMN movies.external_link IS 'Canonical URL built by the server: the TMDb movie or tv page, or for a draft the Google search link of its title. Only where a tap goes and what the client compares by string; not an identity. Never NULL, at most 4096 characters. Immutable.';
COMMENT ON COLUMN movies.version IS 'Server-incremented bigint, 1 on creation, +1 per accepted change. Last write wins; informational for clients.';
COMMENT ON COLUMN movies.deleted_at IS 'Tombstone (description is nulled on delete). Hidden from reads, purged after 90 days. A tombstoned id is never recreated.';

COMMENT ON TABLE subscriptions IS 'Subscriptions to renew or watch for expiry. Renewal pattern: monthly, yearly, lifetime, custom or none.';
COMMENT ON COLUMN subscriptions.id IS 'Client-generated UUID, unique per user only: the key is (user_id, id), so ids of different users cannot collide.';
COMMENT ON COLUMN subscriptions.expiry_date IS 'Calendar date (DATE type, timezone-agnostic), YYYY-MM-DD, at most 2999-12-31 (valid_expiry_year; a later year would not serialize for the client). NULL only for renewal_pattern lifetime (CHECK expiry_required). A past date is valid.';
COMMENT ON COLUMN subscriptions.renewal_pattern IS 'How the record renews: monthly, yearly, lifetime (never expires), custom (custom_renewal_days), none (one-off, cannot be renewed).';
COMMENT ON COLUMN subscriptions.custom_renewal_days IS 'For renewal_pattern=custom: days added to expiry_date on renewal. Positive for custom (custom_days_required), at most 36500 (valid_custom_renewal_days).';
COMMENT ON COLUMN subscriptions.remind_days IS 'Days before expiry to remind. Range 1-14, required for every pattern. Used by notifications once they exist.';
COMMENT ON COLUMN subscriptions.version IS 'Server-incremented bigint, 1 on creation, +1 per accepted change. Last write wins; informational for clients.';
COMMENT ON COLUMN subscriptions.deleted_at IS 'Tombstone (description is nulled on delete). Hidden from reads, purged after 90 days. A tombstoned id is never recreated.';

COMMENT ON TABLE licenses IS 'Licenses to renew or watch for expiry. The license key is stored as plain text for now (owner decision: encryption comes with the Security phase), so DB dumps and backups contain it in clear; returned to its owner, never logged.';
COMMENT ON COLUMN licenses.id IS 'Client-generated UUID, unique per user only: the key is (user_id, id), so ids of different users cannot collide.';
COMMENT ON COLUMN licenses.expiry_date IS 'Calendar date (DATE type, timezone-agnostic), YYYY-MM-DD, at most 2999-12-31 (valid_expiry_year; a later year would not serialize for the client). NULL only for renewal_pattern lifetime (CHECK expiry_required). A past date is valid.';
COMMENT ON COLUMN licenses.renewal_pattern IS 'How the record renews: monthly, yearly, lifetime (never expires), custom (custom_renewal_days), none (one-off, cannot be renewed).';
COMMENT ON COLUMN licenses.custom_renewal_days IS 'For renewal_pattern=custom: days added to expiry_date on renewal. Positive for custom (custom_days_required), at most 36500 (valid_custom_renewal_days).';
COMMENT ON COLUMN licenses.remind_days IS 'Days before expiry to remind. Range 1-14, required for every pattern. Used by notifications once they exist.';
COMMENT ON COLUMN licenses.license_key IS 'Plain text, multi-line capable. Returned to the owner (get, list, export), never logged, nulled on delete.';
COMMENT ON COLUMN licenses.version IS 'Server-incremented bigint, 1 on creation, +1 per accepted change. Last write wins; informational for clients.';
COMMENT ON COLUMN licenses.deleted_at IS 'Tombstone (description and license_key are nulled on delete). Hidden from reads, purged after 90 days. A tombstoned id is never recreated.';

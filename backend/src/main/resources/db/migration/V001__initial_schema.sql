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

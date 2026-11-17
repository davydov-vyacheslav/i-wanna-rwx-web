-- ============================================================================
-- RWX Initial Schema
-- Created: 2026-11-16
-- ============================================================================

-- ============================================================================
-- change_seq: Global monotonic sequence stamped on every write of a synced row.
-- Per-user pull order is the subsequence of rows owned by that user.
-- ============================================================================
CREATE SEQUENCE change_seq;

-- Trigger function: stamps a fresh change_seq on every INSERT/UPDATE of a synced table
-- (tombstoning is an UPDATE, so it is stamped too).
CREATE FUNCTION stamp_change_seq() RETURNS trigger AS $$
BEGIN
  NEW.change_seq := nextval('change_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
-- credentials: Login credentials (GitHub, passkey, dev)
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
  CONSTRAINT valid_type CHECK (type IN ('github', 'passkey', 'dev')),
  CONSTRAINT unique_credential UNIQUE (type, external_id)
);

CREATE INDEX idx_credentials_user_id ON credentials(user_id);
CREATE INDEX idx_credentials_created_at ON credentials(created_at DESC);

-- ============================================================================
-- books: User's book library (from Open Library)
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
  external_id text,
  external_link text,
  version bigint NOT NULL DEFAULT 1,
  change_seq bigint NOT NULL DEFAULT nextval('change_seq'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT valid_status CHECK (status IN ('planned', 'seen')),
  CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 5)
);

-- Duplicate rules over live rows only (tombstones never block re-adding). See column comments for what an index cannot express.
CREATE UNIQUE INDEX uq_books_user_isbn ON books(user_id, isbn)
  WHERE deleted_at IS NULL AND isbn IS NOT NULL;
CREATE UNIQUE INDEX uq_books_user_external_id ON books(user_id, external_id)
  WHERE deleted_at IS NULL AND external_id IS NOT NULL;
CREATE UNIQUE INDEX uq_books_user_draft_title ON books(user_id, lower(btrim(title)))
  WHERE deleted_at IS NULL AND external_id IS NULL;

CREATE INDEX idx_books_updated_at ON books(user_id, updated_at DESC);
CREATE INDEX idx_books_user_change_seq ON books(user_id, change_seq);
CREATE INDEX idx_books_deleted_at ON books(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TRIGGER trg_books_change_seq BEFORE INSERT OR UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION stamp_change_seq();

-- ============================================================================
-- movies: User's movies and TV shows library (from TMDb)
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
  external_id text,
  external_link text,
  version bigint NOT NULL DEFAULT 1,
  change_seq bigint NOT NULL DEFAULT nextval('change_seq'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT valid_type CHECK (type IN ('movie', 'tv')),
  CONSTRAINT valid_status CHECK (status IN ('planned', 'seen')),
  CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 10),
  CONSTRAINT valid_tv_status CHECK (tv_status IN ('ongoing', 'ended'))
);

-- Duplicate rules over live rows only. TMDb movie and tv ids are separate namespaces, hence type in the key.
CREATE UNIQUE INDEX uq_movies_user_type_external_id ON movies(user_id, type, external_id)
  WHERE deleted_at IS NULL AND external_id IS NOT NULL;
CREATE UNIQUE INDEX uq_movies_user_draft_title ON movies(user_id, lower(btrim(title)))
  WHERE deleted_at IS NULL AND external_id IS NULL;

CREATE INDEX idx_movies_updated_at ON movies(user_id, updated_at DESC);
CREATE INDEX idx_movies_user_change_seq ON movies(user_id, change_seq);
CREATE INDEX idx_movies_deleted_at ON movies(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TRIGGER trg_movies_change_seq BEFORE INSERT OR UPDATE ON movies
  FOR EACH ROW EXECUTE FUNCTION stamp_change_seq();

-- ============================================================================
-- subscriptions: Recurring subscription renewals
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
  change_seq bigint NOT NULL DEFAULT nextval('change_seq'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT valid_pattern CHECK (renewal_pattern IN ('monthly', 'yearly', 'lifetime', 'custom', 'none')),
  CONSTRAINT valid_remind_days CHECK (remind_days >= 1 AND remind_days <= 14),
  CONSTRAINT expiry_required CHECK (renewal_pattern = 'lifetime' OR expiry_date IS NOT NULL),
  CONSTRAINT custom_days_required CHECK (renewal_pattern <> 'custom' OR COALESCE(custom_renewal_days, 0) > 0)
);

CREATE INDEX idx_subscriptions_user_expiry_date ON subscriptions(user_id, expiry_date);
CREATE INDEX idx_subscriptions_updated_at ON subscriptions(user_id, updated_at DESC);
CREATE INDEX idx_subscriptions_user_change_seq ON subscriptions(user_id, change_seq);
CREATE INDEX idx_subscriptions_deleted_at ON subscriptions(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TRIGGER trg_subscriptions_change_seq BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION stamp_change_seq();

-- ============================================================================
-- licenses: One-time or non-recurring license expirations
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
  license_key_version integer,
  version bigint NOT NULL DEFAULT 1,
  change_seq bigint NOT NULL DEFAULT nextval('change_seq'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT valid_pattern CHECK (renewal_pattern IN ('monthly', 'yearly', 'lifetime', 'custom', 'none')),
  CONSTRAINT valid_remind_days CHECK (remind_days >= 1 AND remind_days <= 14),
  CONSTRAINT expiry_required CHECK (renewal_pattern = 'lifetime' OR expiry_date IS NOT NULL),
  CONSTRAINT custom_days_required CHECK (renewal_pattern <> 'custom' OR COALESCE(custom_renewal_days, 0) > 0)
);

CREATE INDEX idx_licenses_user_expiry_date ON licenses(user_id, expiry_date);
CREATE INDEX idx_licenses_updated_at ON licenses(user_id, updated_at DESC);
CREATE INDEX idx_licenses_user_change_seq ON licenses(user_id, change_seq);
CREATE INDEX idx_licenses_deleted_at ON licenses(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TRIGGER trg_licenses_change_seq BEFORE INSERT OR UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION stamp_change_seq();

-- ============================================================================
-- user_settings: User preferences (locale, timezone, notifications)
-- ============================================================================
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  locale text,
  push_notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- external_data_source_configuration: API keys for third-party services
-- ============================================================================
CREATE TABLE external_data_source_configuration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  api_key text NOT NULL,
  api_key_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_source CHECK (source_type IN ('tmdb')),
  CONSTRAINT unique_config UNIQUE (user_id, source_type)
);

-- ============================================================================
-- applied_mutations: Idempotency log for /sync/push (one row per client mutationId)
-- ============================================================================
CREATE TABLE applied_mutations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  result jsonb NOT NULL,  -- {status, reason, existingId, version} only; never a record or any secret
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mutation_id),
  CONSTRAINT valid_resource CHECK (resource_type IN ('book', 'movie', 'subscription', 'license'))
);

CREATE INDEX idx_applied_mutations_created_at ON applied_mutations(created_at);

-- ============================================================================
-- push_subscriptions: Web Push subscriptions (one per browser endpoint)
-- ============================================================================
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_push_endpoint UNIQUE (endpoint)
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ============================================================================
-- Table & Column Comments
-- ============================================================================

COMMENT ON TABLE users IS 'User account identity. Created on first successful credential authentication. Display name and avatar from credentials/session only.';
COMMENT ON COLUMN users.disabled_at IS 'Soft-disable timestamp. If set, user cannot log in. For future audit/recovery.';

COMMENT ON TABLE credentials IS 'Login credentials. Supports GitHub OAuth, passkey (future), dev (testing). Contains identity data: display_name, avatar_url (not stored in users table).';
COMMENT ON COLUMN credentials.type IS 'Credential type. CHECK: github, passkey, dev.';
COMMENT ON COLUMN credentials.external_id IS 'External identifier: GitHub numeric ID, passkey WebAuthn credential id (base64url, not the RP id), or dev name. Unique per type.';
COMMENT ON COLUMN credentials.data IS 'Credential metadata (JSONB). GitHub: login, avatar_url, name. Passkey: public key, sign count, algorithms. Never encrypted (identity data).';
COMMENT ON COLUMN credentials.last_used_at IS 'Timestamp of last successful authentication with this credential.';

COMMENT ON TABLE books IS 'User book library. Notes from Open Library API (search results only, no full text). Duplicate rules (media spec): same isbn, same external_id, or a draft with the same trimmed case-insensitive title, among live rows. A draft title that equals the title of a non-draft item, and Unicode NFC normalization of titles, cannot be an index and are checked by the service under the per-user write lock; the draft-vs-draft case is also enforced by uq_books_user_draft_title.';
COMMENT ON COLUMN books.id IS 'Client-generated UUID, unique per user only: the key is (user_id, id), so ids of different users cannot collide.';
COMMENT ON COLUMN books.isbn IS 'Normalized ISBN (no hyphens or spaces, uppercase X), first ISBN of the search hit. NULL for drafts. Immutable. Unique per user among live rows (uq_books_user_isbn); the service normalizes before storing.';
COMMENT ON COLUMN books.external_id IS 'Open Library work id (OL<digits>W). NULL = draft (no separate source column: Open Library is implied for books). Immutable. Unique per user among live rows (uq_books_user_external_id).';
COMMENT ON COLUMN books.version IS 'Server-incremented bigint, 1 on creation, +1 per accepted change. LWW sync and conflict detection (baseVersion).';
COMMENT ON COLUMN books.change_seq IS 'Stamped by trigger from sequence change_seq on every insert/update (incl. tombstoning). Pull cursor.';
COMMENT ON COLUMN books.deleted_at IS 'Tombstone (description is nulled on delete). Hidden from reads, propagated by pull, purged after 90 days. A tombstoned id is never recreated.';

COMMENT ON TABLE movies IS 'User movies and TV shows library. Notes from TMDb API (search results only, no full video). Duplicate rules (media spec): same (type, external_id), or a draft with the same trimmed case-insensitive title, among live rows. A draft title that equals the title or original_title of a non-draft item, and NFC normalization, cannot be an index and are checked by the service under the per-user write lock; the draft-vs-draft case is also enforced by uq_movies_user_draft_title.';
COMMENT ON COLUMN movies.id IS 'Client-generated UUID, unique per user only: the key is (user_id, id), so ids of different users cannot collide.';
COMMENT ON COLUMN movies.original_title IS 'Original-language title from TMDb. Optional.';
COMMENT ON COLUMN movies.tv_status IS 'TV only: ongoing or ended (TMDb Ended and Canceled map to ended). NULL = unknown or not tv.';
COMMENT ON COLUMN movies.type IS 'movie or tv. CHECK constraint enforces valid values.';
COMMENT ON COLUMN movies.season_count IS 'Number of seasons. For TV shows only. NULL for movies.';
COMMENT ON COLUMN movies.external_id IS 'TMDb id (digits). NULL = draft (type movie). Immutable. Unique per user and type among live rows (uq_movies_user_type_external_id).';
COMMENT ON COLUMN movies.version IS 'Server-incremented bigint, 1 on creation, +1 per accepted change. LWW sync and conflict detection (baseVersion).';
COMMENT ON COLUMN movies.change_seq IS 'Stamped by trigger from sequence change_seq on every insert/update (incl. tombstoning). Pull cursor.';
COMMENT ON COLUMN movies.deleted_at IS 'Tombstone (description is nulled on delete). Hidden from reads, propagated by pull, purged after 90 days. A tombstoned id is never recreated.';

COMMENT ON TABLE subscriptions IS 'Recurring subscription renewals. Auto-renew pattern: monthly, yearly, lifetime, custom, or none.';
COMMENT ON COLUMN subscriptions.id IS 'Client-generated UUID, unique per user only: the key is (user_id, id), so ids of different users cannot collide.';
COMMENT ON COLUMN subscriptions.expiry_date IS 'Calendar date (DATE type, timezone-agnostic). Format: YYYY-MM-DD. No time component. NULL only for renewal_pattern lifetime (CHECK expiry_required).';
COMMENT ON COLUMN subscriptions.renewal_pattern IS 'How subscription renews: monthly, yearly, lifetime (never expires), custom (custom_renewal_days), none (no recurrence).';
COMMENT ON COLUMN subscriptions.custom_renewal_days IS 'For renewal_pattern=custom. Number of days to add to expiry_date for next expiry. Must be positive for custom (CHECK custom_days_required).';
COMMENT ON COLUMN subscriptions.remind_days IS 'Days before expiry to send Web Push notification. Range: 1-14. CHECK constraint enforces bounds.';
COMMENT ON COLUMN subscriptions.version IS 'Server-incremented bigint, 1 on creation, +1 per accepted change. LWW sync and conflict detection (baseVersion).';
COMMENT ON COLUMN subscriptions.change_seq IS 'Stamped by trigger from sequence change_seq on every insert/update (incl. tombstoning). Pull cursor.';
COMMENT ON COLUMN subscriptions.deleted_at IS 'Tombstone (description is nulled on delete). Hidden from reads, propagated by pull, purged after 90 days. A tombstoned id is never recreated.';

COMMENT ON TABLE licenses IS 'License key expirations. Can be non-recurring (lifetime) or auto-renewing. The license key is encrypted at rest.';
COMMENT ON COLUMN licenses.id IS 'Client-generated UUID, unique per user only: the key is (user_id, id), so ids of different users cannot collide.';
COMMENT ON COLUMN licenses.expiry_date IS 'Calendar date (DATE type, timezone-agnostic). Format: YYYY-MM-DD. No time component. NULL only for renewal_pattern lifetime (CHECK expiry_required).';
COMMENT ON COLUMN licenses.renewal_pattern IS 'How license recurs: monthly, yearly, lifetime (never expires), custom (custom_renewal_days), none (no recurrence).';
COMMENT ON COLUMN licenses.custom_renewal_days IS 'For renewal_pattern=custom. Number of days to add to expiry_date for next expiry. Must be positive for custom (CHECK custom_days_required).';
COMMENT ON COLUMN licenses.remind_days IS 'Days before expiry to send Web Push notification. Range: 1-14. CHECK constraint enforces bounds.';
COMMENT ON COLUMN licenses.license_key IS 'Encrypted at rest using AES-GCM with versioned key (see license_key_version). Decrypted by the server and returned to the owner in the License resource (REST and sync) because the client shows it masked until revealed (reminders spec); never logged and never put in notifications.';
COMMENT ON COLUMN licenses.version IS 'Server-incremented bigint, 1 on creation, +1 per accepted change. LWW sync and conflict detection (baseVersion).';
COMMENT ON COLUMN licenses.change_seq IS 'Stamped by trigger from sequence change_seq on every insert/update (incl. tombstoning). Pull cursor.';
COMMENT ON COLUMN licenses.deleted_at IS 'Tombstone (license_key and description are nulled on delete). Hidden from reads, propagated by pull, purged after 90 days. A tombstoned id is never recreated.';

COMMENT ON TABLE user_settings IS 'Per-user preferences: locale, timezone, notifications. Each user has exactly one settings row.';
COMMENT ON COLUMN user_settings.timezone IS 'IANA timezone (e.g., Europe/London). Used by scheduler for reminder notifications at local time.';
COMMENT ON COLUMN user_settings.locale IS 'UI language: en, ru or uk (device locale reduced to its language), NULL = not set. Used for i18n on client and server messages.';
COMMENT ON COLUMN user_settings.push_notifications_enabled IS 'Whether user opted into Web Push notifications.';

COMMENT ON TABLE external_data_source_configuration IS 'API keys for third-party services (TMDb, etc.). One row per user per source. Stored as is for now (owner decision: no encryption yet), so DB dumps and backups contain the key in clear.';
COMMENT ON COLUMN external_data_source_configuration.source_type IS 'Service type (tmdb). CHECK constraint. Expandable for Google, etc.';
COMMENT ON COLUMN external_data_source_configuration.api_key IS 'The key as submitted by the user, stored as is for now (no encryption yet). Never returned to the client, never logged.';
COMMENT ON COLUMN external_data_source_configuration.api_key_version IS 'Reserved for a future AES-GCM key version. NULL while api_key is stored as is.';

COMMENT ON TABLE applied_mutations IS 'Server-side idempotency log of /sync/push: status, reason, existing id and version per (user_id, mutation_id) so a retried push returns the same outcome. The row never stores the record (it could contain a license key in clear): on replay the server rebuilds the record from the live row. Purged after 30 days. The mutation outbox itself lives on the client (IndexedDB), there is no server outbox table.';
COMMENT ON TABLE push_subscriptions IS 'Web Push subscriptions per user. endpoint is unique; re-registering an endpoint reassigns it to the caller. Keys are never returned to clients.';
COMMENT ON COLUMN applied_mutations.result IS 'Replayable outcome: only status, conflict, reason, existingId and version. Never the record body: it may hold a license key, and replay rebuilds the record from the live row (a tombstone for a deleted row).';
COMMENT ON COLUMN push_subscriptions.p256dh IS 'Client public key (base64url) for payload encryption.';
COMMENT ON COLUMN push_subscriptions.auth IS 'Client auth secret (base64url). Never logged or returned.';

-- SeatLock schema. Every integrity rule that matters lives HERE, in the database,
-- so no application bug (or second API instance) can bypass it.

CREATE TYPE user_role      AS ENUM ('participant', 'organizer', 'admin');
CREATE TYPE event_mode     AS ENUM ('offline', 'online', 'hybrid');
CREATE TYPE event_status   AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');
CREATE TYPE booking_status AS ENUM ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED');
CREATE TYPE staff_role     AS ENUM ('volunteer');

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text        NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email         text        NOT NULL,                 -- always stored lower-cased by the API
  password_hash text        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'participant',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email)
);

CREATE TABLE events (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizer_id            bigint       NOT NULL REFERENCES users(id),
  slug                    text         NOT NULL,
  title                   text         NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  tagline                 text         NOT NULL DEFAULT '' CHECK (length(tagline) <= 200),
  description_md          text         NOT NULL DEFAULT '' CHECK (length(description_md) <= 20000),
  venue                   text         NOT NULL CHECK (length(venue) BETWEEN 1 AND 200),
  mode                    event_mode   NOT NULL DEFAULT 'offline',
  starts_at               timestamptz  NOT NULL,
  ends_at                 timestamptz  NOT NULL,
  registration_opens_at   timestamptz  NOT NULL,
  registration_closes_at  timestamptz,
  capacity                integer      NOT NULL,
  seats_left              integer      NOT NULL,
  hold_minutes            integer      NOT NULL DEFAULT 5,
  allowed_email_domains   text[],                      -- NULL = anyone may register
  registration_questions  jsonb        NOT NULL DEFAULT '[]',
  banner_url              text,
  status                  event_status NOT NULL DEFAULT 'DRAFT',
  -- Rows created by the race demo. Hidden from every public listing.
  is_demo                 boolean      NOT NULL DEFAULT false,
  created_at              timestamptz  NOT NULL DEFAULT now(),
  updated_at              timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT events_slug_key           UNIQUE (slug),
  CONSTRAINT events_capacity_positive  CHECK (capacity > 0),
  -- THE last line of defence against overselling: even a buggy query cannot push the counter out of range.
  CONSTRAINT events_seats_range        CHECK (seats_left >= 0 AND seats_left <= capacity),
  CONSTRAINT events_time_order         CHECK (ends_at > starts_at),
  CONSTRAINT events_registration_window CHECK (registration_closes_at IS NULL OR registration_closes_at > registration_opens_at),
  CONSTRAINT events_hold_minutes_range CHECK (hold_minutes BETWEEN 1 AND 60)
);
-- Public listing: only published, non-demo events, ordered by start time.
CREATE INDEX events_public_idx ON events (starts_at) WHERE status = 'PUBLISHED' AND NOT is_demo;
CREATE INDEX events_organizer_idx ON events (organizer_id, id DESC);

CREATE TABLE bookings (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id         bigint         NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id          bigint         NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status           booking_status NOT NULL,
  hold_expires_at  timestamptz    NOT NULL,
  idempotency_key  text           NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 100),
  answers          jsonb,
  confirmed_at     timestamptz,
  checked_in_at    timestamptz,
  checked_in_by    bigint REFERENCES users(id),
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now()
);
-- One ACTIVE booking per user per event. Cancelled/expired rows are excluded so people can re-register.
CREATE UNIQUE INDEX bookings_one_active_per_user ON bookings (event_id, user_id) WHERE status IN ('HELD', 'CONFIRMED');
-- Idempotency keys are scoped per user, so one user's key can never collide with another's.
CREATE UNIQUE INDEX bookings_user_idem_key ON bookings (user_id, idempotency_key);
-- The sweeper only ever looks at HELD rows; a partial index keeps it tiny and fast.
CREATE INDEX bookings_held_expiry ON bookings (hold_expires_at) WHERE status = 'HELD';
-- Keyset pagination of an event's registrations: WHERE event_id = $1 AND id > $2 ORDER BY id.
CREATE INDEX bookings_event_id_id ON bookings (event_id, id);
-- "My bookings" page.
CREATE INDEX bookings_user_id_id ON bookings (user_id, id DESC);

CREATE TABLE event_staff (
  event_id bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  bigint NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role     staff_role NOT NULL DEFAULT 'volunteer',
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_staff_user_idx ON event_staff (user_id);

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    bigint REFERENCES users(id) ON DELETE SET NULL,
  action      text   NOT NULL,
  entity_type text   NOT NULL,
  entity_id   bigint NOT NULL,
  details     jsonb  NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at);

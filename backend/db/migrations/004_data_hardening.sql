-- Data hardening. The API already validates everything it accepts; these rules make the DATABASE refuse bad rows
-- too, so a script, a console session or a future bug cannot write something the application would never allow.
--
-- Every constraint is added NOT VALID: it is enforced for every new or changed row at once, without scanning
-- existing rows (so applying it can never fail on, or lock, a table that already holds data).

-- ---- users: names are trimmed, emails are lower-case and shaped like emails ----
ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email)) NOT VALID,
  ADD CONSTRAINT users_email_shape     CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') NOT VALID,
  ADD CONSTRAINT users_name_trimmed    CHECK (name = btrim(name)) NOT VALID,
  ADD CONSTRAINT users_org_trimmed     CHECK (organization IS NULL OR organization = btrim(organization)) NOT VALID;

-- ---- events ----
ALTER TABLE events
  ADD CONSTRAINT events_slug_format      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80) NOT VALID,
  ADD CONSTRAINT events_title_trimmed    CHECK (title = btrim(title) AND venue = btrim(venue)) NOT VALID,
  ADD CONSTRAINT events_banner_https     CHECK (banner_url IS NULL OR banner_url ~ '^https://') NOT VALID,
  ADD CONSTRAINT events_questions_array  CHECK (jsonb_typeof(registration_questions) = 'array') NOT VALID,
  ADD CONSTRAINT events_domains_nonempty CHECK (allowed_email_domains IS NULL OR cardinality(allowed_email_domains) > 0) NOT VALID;

-- ---- bookings: the state a row is in must agree with the timestamps it carries ----
ALTER TABLE bookings
  ADD CONSTRAINT bookings_confirmed_has_time CHECK (status <> 'CONFIRMED' OR confirmed_at IS NOT NULL) NOT VALID,
  -- Only a confirmed registration can be checked in at the gate, and the volunteer who did it is always recorded.
  ADD CONSTRAINT bookings_checkin_needs_confirm CHECK (checked_in_at IS NULL OR confirmed_at IS NOT NULL) NOT VALID,
  ADD CONSTRAINT bookings_checkin_has_actor     CHECK ((checked_in_at IS NULL) = (checked_in_by IS NULL)) NOT VALID,
  ADD CONSTRAINT bookings_answers_object        CHECK (answers IS NULL OR jsonb_typeof(answers) = 'object') NOT VALID;

-- ---- updated_at maintains itself: no code path can forget to bump it ----
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER events_touch   BEFORE UPDATE ON events   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER bookings_touch BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---- indexes for the questions the product asks most ----
-- "Who is present?" on the registrations sheet and the live attendance count.
CREATE INDEX bookings_checked_in_idx ON bookings (event_id) WHERE checked_in_at IS NOT NULL;
-- The audit trail of one actor (admin view) and the newest-first feed.
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

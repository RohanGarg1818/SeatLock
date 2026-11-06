-- Event posters uploaded straight to this API (used when Cloudinary is not configured).
-- The bytes live in Postgres so they survive redeploys; an event's banner_url then points at /api/uploads/<id>
-- (the website proxies /api/* to this server). Cloudinary https URLs keep working exactly as before.
CREATE TABLE IF NOT EXISTS poster_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  data         bytea NOT NULL CHECK (octet_length(data) <= 5242880),
  created_by   bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_banner_https;
ALTER TABLE events ADD CONSTRAINT events_banner_https
  CHECK (banner_url IS NULL OR banner_url ~ '^https://' OR banner_url ~ '^/api/uploads/[0-9a-f-]{36}$') NOT VALID;

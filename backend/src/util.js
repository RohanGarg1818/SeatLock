import { z } from 'zod';
import { AppError } from './errors.js';

// One validation approach everywhere: parse(schema, data) -> typed data, or throw 422 with per-field messages.
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', { fields });
}

// Ids are bigints; Postgres returns them as strings, and so do we (JS numbers lose precision past 2^53).
export function idParam(value, what = 'id') {
  if (!/^\d{1,18}$/.test(String(value))) throw new AppError(400, 'BAD_REQUEST', `Invalid ${what}.`);
  return String(value);
}

export const limitParam = (value, def = 50, max = 200) => {
  const n = Number.parseInt(value ?? def, 10);
  if (Number.isNaN(n) || n < 1) return def;
  return Math.min(n, max);
};

// Escape LIKE wildcards so a search for "100%" matches literally.
export const likePattern = (s) => `%${String(s).replace(/[\\%_]/g, '\\$&')}%`;

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

// SQL fragment computing the public registration state with DATABASE time (now()), never the app server's clock.
// Several app servers may have skewed clocks; the database is the single clock everyone agrees on.
export const REG_STATE_SQL = `
  CASE
    WHEN e.status = 'CANCELLED' THEN 'CANCELLED'
    WHEN e.status = 'COMPLETED' OR e.ends_at <= now() THEN 'CLOSED'
    WHEN e.registration_opens_at > now() THEN 'NOT_OPEN'
    WHEN e.registration_closes_at IS NOT NULL AND e.registration_closes_at <= now() THEN 'CLOSED'
    WHEN e.seats_left <= 0 THEN 'SOLD_OUT'
    ELSE 'OPEN'
  END`;

export const EVENT_COLS = `e.id, e.organizer_id, e.slug, e.title, e.tagline, e.description_md, e.venue, e.mode,
  e.starts_at, e.ends_at, e.registration_opens_at, e.registration_closes_at, e.capacity, e.seats_left, e.hold_minutes,
  e.allowed_email_domains, e.registration_questions, e.banner_url, e.status, e.created_at, e.updated_at`;

export const BOOKING_COLS = `b.id, b.event_id, b.user_id, b.status, b.hold_expires_at, b.answers, b.confirmed_at,
  b.checked_in_at, b.created_at, b.updated_at`;

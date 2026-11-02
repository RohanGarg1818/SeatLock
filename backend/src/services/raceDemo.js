// Concurrency demo: fires many simultaneous booking requests at the API itself and then checks
// whether the core invariant survived:  active bookings (HELD + CONFIRMED) <= capacity.
import { randomBytes } from 'node:crypto';
import { signToken } from '../middleware/auth.js';

export const NAIVE_SQL_EXPLANATION = `lost update: both requests read seats_left=1, both write back 0, both insert a booking`;

export async function runRace(ctx, { mode, capacity, requests, baseUrl, organizerId }) {
  const { pool, config } = ctx;
  const runId = randomBytes(4).toString('hex');
  let tempOrganizer = null;

  if (!organizerId) {
    const o = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Demo Organizer', $1, 'x', 'organizer') RETURNING id`,
      [`demo-org-${runId}@demo.invalid`],
    );
    organizerId = tempOrganizer = o.rows[0].id;
  }

  // A hidden event (is_demo) that already accepts registrations.
  const ev = await pool.query(
    `INSERT INTO events (organizer_id, slug, title, venue, starts_at, ends_at, registration_opens_at, capacity, seats_left,
                         hold_minutes, status, is_demo)
     VALUES ($1, $2, 'Race demo', 'Nowhere', now() + interval '1 day', now() + interval '2 days', now() - interval '1 minute',
             $3, $3, 30, 'PUBLISHED', true)
     RETURNING id`,
    [organizerId, `demo-race-${runId}`, capacity],
  );
  const eventId = ev.rows[0].id;

  // One distinct user per request, so every request is a different person trying for a seat.
  const users = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     SELECT 'Demo User ' || g, 'demo-' || $1 || '-' || g || '@demo.invalid', 'x' FROM generate_series(1, $2) g
     RETURNING id, name, email, role`,
    [runId, requests],
  );
  await ctx.redis?.initEvent(eventId); // no-op when Redis is off

  const path = mode === 'naive' ? `/demo/events/${eventId}/book-naive` : `/events/${eventId}/hold`;
  const started = Date.now();
  const codes = {};
  await Promise.all(
    users.rows.map(async (u, i) => {
      let status;
      try {
        const r = await fetch(baseUrl + path, {
          method: 'POST',
          headers: { Authorization: `Bearer ${signToken(config, u)}`, 'Idempotency-Key': `race-${runId}-${i}` },
        });
        status = r.status;
        await r.arrayBuffer();
      } catch {
        status = 'network_error';
      }
      codes[status] = (codes[status] || 0) + 1;
    }),
  );
  const elapsedMs = Date.now() - started;

  const final = await pool.query(
    `SELECT e.capacity, e.seats_left,
            (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id) AS bookings_created,
            (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status IN ('HELD','CONFIRMED')) AS active
       FROM events e WHERE e.id = $1`,
    [eventId],
  );
  const f = final.rows[0];
  const result = {
    mode,
    capacity: f.capacity,
    requests_fired: requests,
    response_codes: codes,
    bookings_created: f.bookings_created,
    final_seats_left: f.seats_left,
    oversold_by: Math.max(0, f.active - f.capacity),
    invariant_held: f.active <= f.capacity,
    // seats_left should equal capacity - active. If not, the counter lied (the lost-update symptom).
    counter_consistent: f.seats_left === f.capacity - f.active,
    elapsed_ms: elapsedMs,
    explanation: mode === 'naive' ? NAIVE_SQL_EXPLANATION : 'conditional UPDATE: check and decrement are one atomic statement',
  };

  // Clean up so demo data never lingers (bookings cascade from the event).
  await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`demo-${runId}-%@demo.invalid`]);
  if (tempOrganizer) await pool.query('DELETE FROM users WHERE id = $1', [tempOrganizer]);
  await ctx.redis?.dropEvent(eventId);
  return { ...result, event_id: eventId };
}

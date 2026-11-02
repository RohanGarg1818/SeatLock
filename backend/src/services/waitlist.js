// Waitlist: join, leave, and automatic promotion.
//
// THE RULE: a seat that is freed while someone is waiting is handed straight to the first waiter, in the SAME
// transaction that freed it. seats_left never rises above 0 while a live waiter exists, so a new visitor cannot
// slip in ahead of the queue, and the capacity invariant (active bookings <= capacity) is untouched, because
// "free a seat, then take it for the waiter" is just a transfer.
import { AppError } from '../errors.js';
import { tx } from '../db.js';
import { REG_STATE_SQL } from '../util.js';

const domainOf = (email) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

/**
 * Hand free seats to waiters. MUST be called inside a transaction that already touched the event row
 * (cancel, sweeper, capacity change), so that row is locked and nobody else is promoting for this event.
 * Returns [{ userId, bookingId, email, name }] for the people who just got a hold.
 */
export async function promoteWaitlist(client, eventId, { holdMinutes }) {
  const promoted = [];
  // Lock the event row ourselves too: harmless if the caller already did, and makes the function safe on its own.
  const ev = await client.query(
    `SELECT e.seats_left, e.allowed_email_domains, e.slug, e.title,
            (e.status = 'PUBLISHED' AND e.ends_at > now() AND e.registration_opens_at <= now()
             AND (e.registration_closes_at IS NULL OR e.registration_closes_at > now())) AS live
       FROM events e WHERE e.id = $1 FOR UPDATE`, [eventId]);
  const e = ev.rows[0];
  if (!e || !e.live) return promoted;
  let seats = e.seats_left;

  while (seats > 0) {
    const w = await client.query(
      `SELECT w.id, w.user_id, u.email, u.name,
              EXISTS (SELECT 1 FROM bookings b WHERE b.event_id = w.event_id AND b.user_id = w.user_id
                       AND b.status IN ('HELD','CONFIRMED')) AS has_active
         FROM waitlist w JOIN users u ON u.id = w.user_id
        WHERE w.event_id = $1 ORDER BY w.id LIMIT 1 FOR UPDATE OF w`, [eventId]);
    const next = w.rows[0];
    if (!next) break;

    // Skip (and drop) people who can no longer be served: they already hold a seat, or the organizer changed the
    // allowed domains after they joined. They do not consume a seat.
    const eligible = !e.allowed_email_domains || e.allowed_email_domains.includes(domainOf(next.email));
    if (next.has_active || !eligible) {
      await client.query('DELETE FROM waitlist WHERE id = $1', [next.id]);
      continue;
    }

    await client.query('UPDATE events SET seats_left = seats_left - 1, updated_at = now() WHERE id = $1 AND seats_left > 0', [eventId]);
    const ins = await client.query(
      `INSERT INTO bookings (event_id, user_id, status, hold_expires_at, idempotency_key)
       VALUES ($1, $2, 'HELD', now() + make_interval(mins => $3), $4) RETURNING id`,
      [eventId, next.user_id, holdMinutes, `waitlist-${next.id}`]);
    await client.query('DELETE FROM waitlist WHERE id = $1', [next.id]);
    seats--;
    promoted.push({ userId: next.user_id, bookingId: ins.rows[0].id, email: next.email, name: next.name, slug: e.slug, title: e.title });
  }
  return promoted;
}

/** After commit: tell Redis (rebuild this event's keys from Postgres) and email the people who got a seat. */
export async function afterPromotion(ctx, eventId, promoted) {
  if (!promoted.length) return;
  await ctx.redis?.syncEvent(eventId);
  for (const p of promoted) {
    ctx.mailer?.waitlistPromoted({ to: p.email, name: p.name, eventTitle: p.title, slug: p.slug, minutes: ctx.config.waitlistHoldMinutes });
  }
}

export async function joinWaitlist(ctx, { eventId, user }) {
  return tx(ctx.pool, async (c) => {
    // FOR SHARE: many people can join at once, but a seat being freed or taken (an UPDATE of this row) must
    // finish first, so "is the event really sold out?" is answered consistently.
    const { rows } = await c.query(
      `SELECT ${REG_STATE_SQL} AS state, e.allowed_email_domains, e.status FROM events e WHERE e.id = $1 FOR SHARE`, [eventId]);
    const e = rows[0];
    if (!e || e.status === 'DRAFT') throw new AppError(404, 'EVENT_NOT_FOUND', 'Event not found.');
    if (e.state === 'CANCELLED') throw new AppError(403, 'EVENT_CANCELLED', 'This event was cancelled.');
    if (e.state === 'CLOSED') throw new AppError(403, 'REGISTRATION_CLOSED', 'Registration is closed.');
    if (e.state === 'NOT_OPEN') throw new AppError(403, 'REGISTRATION_NOT_OPEN', 'Registration has not opened yet.');
    if (e.allowed_email_domains && !e.allowed_email_domains.includes(domainOf(user.email))) {
      throw new AppError(403, 'NOT_ELIGIBLE', 'This event is limited to specific email domains.');
    }
    if (e.state === 'OPEN') throw new AppError(409, 'SEATS_AVAILABLE', 'Seats are available. Register instead of joining the waitlist.');

    const active = await c.query(`SELECT 1 FROM bookings WHERE event_id = $1 AND user_id = $2 AND status IN ('HELD','CONFIRMED')`, [eventId, user.id]);
    if (active.rowCount) throw new AppError(409, 'ALREADY_REGISTERED', 'You already have a booking for this event.');

    // Idempotent: joining twice keeps the original place in line.
    await c.query('INSERT INTO waitlist (event_id, user_id) VALUES ($1, $2) ON CONFLICT (event_id, user_id) DO NOTHING', [eventId, user.id]);
    return waitlistPosition(c, eventId, user.id);
  });
}

export async function leaveWaitlist(ctx, { eventId, user }) {
  const { rowCount } = await ctx.pool.query('DELETE FROM waitlist WHERE event_id = $1 AND user_id = $2', [eventId, user.id]);
  if (!rowCount) throw new AppError(404, 'NOT_ON_WAITLIST', 'You are not on the waitlist for this event.');
}

/** 1-based place in line, or null. */
export async function waitlistPosition(db, eventId, userId) {
  const { rows } = await db.query(
    `SELECT (SELECT count(*)::int FROM waitlist x WHERE x.event_id = w.event_id AND x.id <= w.id) AS position
       FROM waitlist w WHERE w.event_id = $1 AND w.user_id = $2`, [eventId, userId]);
  return rows[0]?.position ?? null;
}

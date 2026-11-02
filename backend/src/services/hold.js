// The heart of SeatLock: taking a seat without ever overselling.
//
// Why a conditional UPDATE?  The check ("is a seat left?") and the write ("take it") happen in ONE
// statement, so Postgres evaluates both while holding the row lock. Two requests can never both see
// "1 seat left" and both take it: the second one waits for the first to commit, re-reads the row,
// finds seats_left = 0 and matches zero rows.
import { AppError } from '../errors.js';
import { tx } from '../db.js';
import { BOOKING_COLS } from '../util.js';

const domainOf = (email) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

async function diagnoseFailure(client, eventId, email) {
  // The UPDATE matched nothing. Find out WHY so the client gets a precise answer.
  const { rows } = await client.query(
    `SELECT status, seats_left, ends_at <= now() AS ended, registration_opens_at > now() AS not_open,
            (registration_closes_at IS NOT NULL AND registration_closes_at <= now()) AS closed,
            (allowed_email_domains IS NULL OR $2 = ANY(allowed_email_domains)) AS eligible
       FROM events WHERE id = $1`,
    [eventId, domainOf(email)],
  );
  const e = rows[0];
  if (!e || e.status === 'DRAFT') return new AppError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  if (e.status === 'CANCELLED') return new AppError(403, 'EVENT_CANCELLED', 'This event was cancelled.');
  if (e.status === 'COMPLETED' || e.ended) return new AppError(403, 'REGISTRATION_CLOSED', 'This event has ended.');
  if (e.not_open) return new AppError(403, 'REGISTRATION_NOT_OPEN', 'Registration has not opened yet.');
  if (e.closed) return new AppError(403, 'REGISTRATION_CLOSED', 'Registration has closed.');
  if (!e.eligible) return new AppError(403, 'NOT_ELIGIBLE', 'This event is limited to specific email domains.');
  return new AppError(409, 'SOLD_OUT', 'No seats left.');
}

async function holdInPostgres(client, { eventId, user, key }) {
  // 1. Idempotent replay: same user + same key => return the original booking, consume nothing.
  const prior = await client.query(
    `SELECT ${BOOKING_COLS}, GREATEST(0, floor(extract(epoch FROM (b.hold_expires_at - now()))))::int AS hold_seconds_left
       FROM bookings b WHERE b.user_id = $1 AND b.idempotency_key = $2`,
    [user.id, key],
  );
  if (prior.rows[0]) {
    const row = prior.rows[0];
    if (row.event_id !== eventId) {
      throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different event.');
    }
    return { created: false, booking: row, userHasActive: ['HELD', 'CONFIRMED'].includes(row.status) };
  }

  // 2. Cheap early exit for "already registered". The unique index is still the real guard
  //    (two simultaneous requests can both pass this SELECT); this just avoids needless row locking.
  const active = await client.query(
    `SELECT id, status FROM bookings WHERE event_id = $1 AND user_id = $2 AND status IN ('HELD','CONFIRMED')`,
    [eventId, user.id],
  );
  if (active.rows[0]) {
    throw Object.assign(
      new AppError(409, 'ALREADY_REGISTERED', 'You already have a booking for this event.', {
        booking_id: active.rows[0].id, status: active.rows[0].status,
      }),
      { userHasActive: true },
    );
  }

  // 3. THE atomic seat grab. All business rules live in the WHERE clause and use the database clock.
  const seat = await client.query(
    `UPDATE events
        SET seats_left = seats_left - 1, updated_at = now()
      WHERE id = $1
        AND seats_left > 0
        AND status = 'PUBLISHED'
        AND registration_opens_at <= now()
        AND (registration_closes_at IS NULL OR registration_closes_at > now())
        AND ends_at > now()
        AND (allowed_email_domains IS NULL OR $2 = ANY(allowed_email_domains))
      RETURNING seats_left, hold_minutes`,
    [eventId, domainOf(user.email)],
  );
  if (seat.rowCount === 0) throw await diagnoseFailure(client, eventId, user.email);

  // 4. Record who holds the seat. If this INSERT fails (duplicate user/key), the whole transaction
  //    rolls back and the seat decrement above disappears with it.
  const ins = await client.query(
    `INSERT INTO bookings AS b (event_id, user_id, status, hold_expires_at, idempotency_key)
     VALUES ($1, $2, 'HELD', now() + make_interval(mins => $3), $4)
     RETURNING ${BOOKING_COLS}, GREATEST(0, floor(extract(epoch FROM (b.hold_expires_at - now()))))::int AS hold_seconds_left`,
    [eventId, user.id, seat.rows[0].hold_minutes, key],
  );
  // Someone who was waiting and managed to register directly no longer needs their place in line.
  await client.query('DELETE FROM waitlist WHERE event_id = $1 AND user_id = $2', [eventId, user.id]);
  return { created: true, booking: ins.rows[0], seatsLeft: seat.rows[0].seats_left, userHasActive: true };
}

/**
 * Public entry point. Returns { created, booking } or throws AppError.
 * `ctx.redis` (optional) adds a fast pre-filter in FRONT of Postgres; see redisLayer.js.
 * Key principle: Postgres' conditional UPDATE still runs for every request that gets past Redis,
 * so Redis being wrong can cause false "sold out" answers but never overselling.
 */
export async function holdSeat(ctx, { eventId, user, key }) {
  const { pool, redis } = ctx;

  let admitted = false;
  if (redis) {
    const verdict = await redis.admit(eventId, user.id);
    if (verdict === 'SOLD_OUT') throw new AppError(409, 'SOLD_OUT', 'No seats left.');
    admitted = verdict === 'ADMITTED';
  }

  let result;
  try {
    result = await tx(pool, (client) => holdInPostgres(client, { eventId, user, key }));
  } catch (err) {
    // Concurrent duplicates lose at the unique index. Turn them into the right answer.
    const outcome = err.code === '23505' ? await resolveDuplicate(pool, err, { eventId, user, key }) : err;
    if (outcome instanceof Error) {
      if (outcome.code === 'SOLD_OUT') redis?.markSoldOut(eventId);
      // Redis let this request through but Postgres did not give a NEW seat: undo the Redis change.
      // If the user in fact already holds a booking, keep them in the holders set.
      if (admitted) await redis.compensate(eventId, user.id, { keepHolder: outcome.userHasActive === true });
      throw outcome;
    }
    result = outcome; // the loser of a same-key race: replay the winner's booking
  }

  if (admitted && !result.created) await redis.compensate(eventId, user.id, { keepHolder: result.userHasActive });
  if (result.created && result.seatsLeft === 0) redis?.markSoldOut(eventId);
  return { created: result.created, booking: result.booking };
}

async function resolveDuplicate(pool, err, { eventId, user, key }) {
  // Both unique indexes may be violated by the same INSERT and Postgres reports whichever it checks first,
  // so we cannot trust err.constraint alone. Always ask first: did this exact key already win? If so, replay it.
  const replay = await pool.query(
    `SELECT ${BOOKING_COLS}, GREATEST(0, floor(extract(epoch FROM (b.hold_expires_at - now()))))::int AS hold_seconds_left
       FROM bookings b WHERE b.user_id = $1 AND b.idempotency_key = $2`,
    [user.id, key],
  );
  if (replay.rows[0]) {
    if (replay.rows[0].event_id !== eventId) {
      return new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different event.');
    }
    return { created: false, booking: replay.rows[0], userHasActive: true };
  }
  if (err.constraint === 'bookings_one_active_per_user' || err.constraint === 'bookings_user_idem_key') {
    // A different key already holds this user's seat.
    const { rows } = await pool.query(
      `SELECT id, status FROM bookings WHERE event_id = $1 AND user_id = $2 AND status IN ('HELD','CONFIRMED')`,
      [eventId, user.id],
    );
    return Object.assign(
      new AppError(409, 'ALREADY_REGISTERED', 'You already have a booking for this event.', rows[0] && { booking_id: rows[0].id, status: rows[0].status }),
      { userHasActive: true },
    );
  }
  return err;
}

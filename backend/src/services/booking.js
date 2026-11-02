// Confirm and cancel. Both are conditional UPDATEs: the WHERE clause names the state we expect,
// so an illegal transition (confirming an expired hold, cancelling twice) matches zero rows
// instead of corrupting data. Zero rows => we look again to give the caller a precise reason.
import { AppError } from '../errors.js';
import { tx } from '../db.js';
import { validateAnswers } from '../questions.js';
import { BOOKING_COLS } from '../util.js';
import { promoteWaitlist, afterPromotion } from './waitlist.js';

const notFound = () => new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');

export async function confirmBooking(ctx, { bookingId, user, answers }) {
  const { pool } = ctx;
  // Look at the booking first (owner only: someone else's booking looks like "not found").
  const cur = await pool.query(
    `SELECT ${BOOKING_COLS}, (b.hold_expires_at <= now()) AS hold_expired, e.registration_questions
       FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = $1 AND b.user_id = $2`, [bookingId, user.id]);
  const b = cur.rows[0];
  if (!b) throw notFound();
  const { registration_questions, hold_expired, ...booking } = b;

  if (b.status === 'CONFIRMED') return { booking, alreadyConfirmed: true }; // idempotent retry
  if (b.status === 'EXPIRED' || (b.status === 'HELD' && hold_expired)) {
    throw new AppError(410, 'HOLD_EXPIRED', 'Your seat hold expired. Please start again.');
  }
  if (b.status === 'CANCELLED') throw new AppError(409, 'BOOKING_CANCELLED', 'This booking was cancelled.');

  // Server-side validation against the event's questions. The browser form is only a convenience.
  const v = validateAnswers(registration_questions, answers ?? {});
  if (!v.ok) throw new AppError(422, 'VALIDATION_FAILED', 'Some answers are invalid.', { fields: v.fields });

  // The seat is only ours if the hold has not expired, judged by the DATABASE clock. This check lives
  // here (not in the sweeper) so a slow or crashed sweeper can never let an expired hold be confirmed.
  const { rows } = await pool.query(
    `UPDATE bookings b SET status = 'CONFIRMED', answers = $3, confirmed_at = now(), updated_at = now()
      WHERE b.id = $1 AND b.user_id = $2 AND b.status = 'HELD' AND b.hold_expires_at > now()
      RETURNING ${BOOKING_COLS}`,
    [bookingId, user.id, JSON.stringify(v.answers)],
  );
  if (rows[0]) return { booking: rows[0], alreadyConfirmed: false };

  // Zero rows: something changed between our SELECT and UPDATE. Work out what.
  const again = await pool.query(
    `SELECT ${BOOKING_COLS} FROM bookings b WHERE b.id = $1 AND b.user_id = $2`, [bookingId, user.id]);
  if (again.rows[0]?.status === 'CONFIRMED') return { booking: again.rows[0], alreadyConfirmed: true }; // a duplicate request won
  if (again.rows[0]?.status === 'CANCELLED') throw new AppError(409, 'BOOKING_CANCELLED', 'This booking was cancelled.');
  throw new AppError(410, 'HOLD_EXPIRED', 'Your seat hold expired. Please start again.');
}

export async function cancelBooking(ctx, { bookingId, user }) {
  const { pool } = ctx;
  const result = await tx(pool, async (c) => {
    // The state check and the transition are one statement. If the sweeper (or a double click) got
    // there first, this matches nothing and the seat is NOT released twice.
    const { rows } = await c.query(
      `UPDATE bookings b SET status = 'CANCELLED', updated_at = now()
        WHERE b.id = $1 AND b.user_id = $2 AND b.status IN ('HELD','CONFIRMED') AND b.checked_in_at IS NULL
        RETURNING ${BOOKING_COLS}`, [bookingId, user.id]);
    if (!rows[0]) {
      const cur = await c.query(`SELECT status, checked_in_at FROM bookings WHERE id = $1 AND user_id = $2`, [bookingId, user.id]);
      if (!cur.rows[0]) throw notFound();
      if (cur.rows[0].checked_in_at) throw new AppError(409, 'ALREADY_CHECKED_IN', 'You already attended; this booking can no longer be cancelled.');
      throw new AppError(409, 'BOOKING_NOT_ACTIVE', `This booking is already ${cur.rows[0].status.toLowerCase()}.`);
    }
    // Return the seat in the same transaction, so "cancelled" and "seat free" can never disagree.
    await c.query('UPDATE events SET seats_left = seats_left + 1, updated_at = now() WHERE id = $1', [rows[0].event_id]);
    // If someone is waiting, the freed seat goes straight to them, in this same transaction.
    const promoted = await promoteWaitlist(c, rows[0].event_id, { holdMinutes: ctx.config.waitlistHoldMinutes });
    return { booking: rows[0], promoted };
  });
  // After commit: Redis and email. A promotion changes who holds seats, so rebuild Redis from Postgres;
  // otherwise just return the one seat.
  if (result.promoted.length) await afterPromotion(ctx, result.booking.event_id, result.promoted);
  else await ctx.redis?.seatsReturned(result.booking.event_id, [user.id]);
  return result.booking;
}

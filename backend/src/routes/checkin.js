import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { parse, idParam } from '../util.js';
import { verifyTicket } from '../tickets.js';
import { rateLimit } from '../ratelimit.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';
import { labelAnswers } from '../questions.js';

const schema = z.object({ token: z.string().min(1).max(500), event_id: z.string().regex(/^\d+$/).optional(), preview: z.boolean().optional() });

export default function checkinRouter(ctx, { requireAuth }) {
  const r = Router();
  const { pool, config } = ctx;
  // Gate scanners work fast, so this limit is much higher than the registration ones.
  const limit = rateLimit(ctx, { name: 'checkin', limit: Math.max(300, config.rateLimit.bookingPerMin * 10), by: 'user' });

  // POST /checkin { token, event_id?, preview? } — organizer, admin, or a volunteer of THIS event.
  // preview:true only LOOKS (who is this, is the ticket valid) and changes nothing, so a volunteer can verify a ticket
  // before letting the person in, or double-check someone without using up their one check-in.
  r.post('/checkin', requireAuth, limit, async (req, res) => {
    const { token, event_id, preview } = parse(schema, req.body);

    // 1. Signature first: a forged or edited ticket is rejected before any database work.
    const ticket = verifyTicket(config, token);
    if (!ticket) throw new AppError(400, 'INVALID_TICKET', 'This QR code is not a valid SeatLock ticket.');
    // A volunteer scanning at the wrong event's gate gets a clear message instead of a confusing one.
    if (event_id && event_id !== ticket.eventId) throw new AppError(400, 'WRONG_EVENT', 'This ticket is for a different event.');

    const result = await tx(pool, async (c) => {
      // 2. Is the scanner allowed to check people in to THIS event?
      const ev = await c.query(
        `SELECT e.id, e.title, e.organizer_id, e.registration_questions, e.starts_at, e.venue,
                EXISTS (SELECT 1 FROM event_staff s WHERE s.event_id = e.id AND s.user_id = $2) AS is_staff
           FROM events e WHERE e.id = $1`, [ticket.eventId, req.user.id]);
      const e = ev.rows[0];
      if (!e) throw new AppError(404, 'EVENT_NOT_FOUND', 'Event not found.');
      if (!(e.organizer_id === req.user.id || req.user.role === 'admin' || e.is_staff)) {
        throw new AppError(403, 'NOT_STAFF', 'You are not a volunteer or organizer for this event.');
      }

      // Details shown on the gate screen: everything the person told us when registering.
      const detail = await c.query(
        `SELECT b.id, b.status, b.answers, b.confirmed_at, b.checked_in_at, b.checked_in_by, s.name AS checked_in_by_name,
                u.name AS attendee, u.email
           FROM bookings b JOIN users u ON u.id = b.user_id LEFT JOIN users s ON s.id = b.checked_in_by
          WHERE b.id = $1 AND b.event_id = $2`, [ticket.bookingId, ticket.eventId]);
      const d = detail.rows[0];
      const shape = (row, checkedInAt) => ({
        attendee: row.attendee, email: row.email, event_title: e.title, event_id: e.id, booking_id: row.id,
        registered_at: row.confirmed_at, checked_in_at: checkedInAt, details: labelAnswers(e.registration_questions, row.answers),
      });

      if (preview) {
        if (!d) throw new AppError(404, 'BOOKING_NOT_FOUND', 'No such booking.');
        if (d.checked_in_at) throw new AppError(409, 'ALREADY_CHECKED_IN', `${d.attendee} was already checked in.`, {
          attendee: d.attendee, checked_in_at: d.checked_in_at, checked_in_by: { id: d.checked_in_by, name: d.checked_in_by_name } });
        if (d.status === 'CANCELLED') throw new AppError(409, 'BOOKING_CANCELLED', 'This booking was cancelled.', { attendee: d.attendee });
        if (d.status !== 'CONFIRMED') throw new AppError(409, 'NOT_CONFIRMED', 'This booking was never confirmed.', { attendee: d.attendee });
        return { result: 'VALID', ...shape(d, null) };
      }

      // 3. THE check-in. One conditional UPDATE: the status check, the "not yet checked in" check and the
      //    write happen together, so two phones scanning the same ticket at once cannot both succeed.
      const up = await c.query(
        `UPDATE bookings b SET checked_in_at = now(), checked_in_by = $2, updated_at = now()
          WHERE b.id = $1 AND b.event_id = $3 AND b.status = 'CONFIRMED' AND b.checked_in_at IS NULL
          RETURNING b.id, b.user_id, b.checked_in_at`, [ticket.bookingId, req.user.id, ticket.eventId]);

      if (!up.rows[0]) {
        // Zero rows: say exactly why.
        const why = await c.query(
          `SELECT b.status, b.checked_in_at, b.checked_in_by, s.name AS checked_in_by_name, u.name AS attendee
             FROM bookings b JOIN users u ON u.id = b.user_id LEFT JOIN users s ON s.id = b.checked_in_by
            WHERE b.id = $1 AND b.event_id = $2`, [ticket.bookingId, ticket.eventId]);
        const b = why.rows[0];
        if (!b) throw new AppError(404, 'BOOKING_NOT_FOUND', 'No such booking.');
        if (b.checked_in_at) {
          throw new AppError(409, 'ALREADY_CHECKED_IN', `${b.attendee} was already checked in.`, {
            attendee: b.attendee, checked_in_at: b.checked_in_at, checked_in_by: { id: b.checked_in_by, name: b.checked_in_by_name },
          });
        }
        if (b.status === 'CANCELLED') throw new AppError(409, 'BOOKING_CANCELLED', 'This booking was cancelled.', { attendee: b.attendee });
        throw new AppError(409, 'NOT_CONFIRMED', 'This booking was never confirmed.', { attendee: b.attendee });
      }

      await audit(c, req.user.id, 'checkin', 'event', ticket.eventId, { booking_id: ticket.bookingId, attendee_id: up.rows[0].user_id });
      return { result: 'OK', ...shape(d, up.rows[0].checked_in_at) };
    });
    res.json(result);
  });

  return r;
}

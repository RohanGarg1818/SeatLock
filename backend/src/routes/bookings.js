import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { parse, idParam, BOOKING_COLS } from '../util.js';
import { holdSeat } from '../services/hold.js';
import { confirmBooking, cancelBooking } from '../services/booking.js';
import { rateLimit } from '../ratelimit.js';
import { makeTicket } from '../tickets.js';
import { joinWaitlist, leaveWaitlist } from '../services/waitlist.js';

export default function bookingsRouter(ctx, { requireAuth }) {
  const r = Router();
  const { pool, config } = ctx;
  // Per-user limit so one account cannot hammer the registration endpoints.
  const limit = rateLimit(ctx, { name: 'booking', limit: config.rateLimit.bookingPerMin, by: 'user' });

  // POST /events/:id/hold — take a seat for hold_minutes.
  r.post('/events/:id/hold', requireAuth, limit, async (req, res) => {
    const eventId = idParam(req.params.id);
    const key = req.get('idempotency-key');
    if (!key || key.length > 100) {
      throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header (1-100 characters).');
    }
    const { created, booking } = await holdSeat(ctx, { eventId, user: req.user, key });
    // 201 = a new hold was created; 200 = this key was seen before and we returned the original.
    res.status(created ? 201 : 200).json({ booking });
  });

  // Waitlist: only for sold-out events. First come, first served; a freed seat becomes a hold for the first in line.
  r.post('/events/:id/waitlist', requireAuth, limit, async (req, res) => {
    const position = await joinWaitlist(ctx, { eventId: idParam(req.params.id), user: req.user });
    res.json({ waitlist: { position } });
  });
  r.delete('/events/:id/waitlist', requireAuth, limit, async (req, res) => {
    await leaveWaitlist(ctx, { eventId: idParam(req.params.id), user: req.user });
    res.status(204).end();
  });
  r.get('/me/waitlist', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.id AS event_id, e.title AS event_title, e.slug AS event_slug, e.starts_at AS event_starts_at, e.venue AS event_venue,
              (SELECT count(*)::int FROM waitlist x WHERE x.event_id = w.event_id AND x.id <= w.id) AS position
         FROM waitlist w JOIN events e ON e.id = w.event_id WHERE w.user_id = $1 ORDER BY w.id DESC`, [req.user.id]);
    res.json({ waitlist: rows });
  });

  const confirmSchema = z.object({ answers: z.record(z.string(), z.unknown()).default({}) });

  r.post('/bookings/:id/confirm', requireAuth, limit, async (req, res) => {
    const { answers } = parse(confirmSchema, req.body ?? {});
    const { booking, alreadyConfirmed } = await confirmBooking(ctx, { bookingId: idParam(req.params.id), user: req.user, answers });
    if (!alreadyConfirmed && ctx.mailer) {
      // Courtesy email, after the commit, never awaited: a mail problem cannot affect the registration.
      pool.query('SELECT title FROM events WHERE id = $1', [booking.event_id])
        .then(({ rows }) => ctx.mailer.ticketConfirmed({ to: req.user.email, name: req.user.name, eventTitle: rows[0]?.title ?? 'your event', bookingId: booking.id }))
        .catch(() => {});
    }
    res.json({ booking });
  });

  r.post('/bookings/:id/cancel', requireAuth, limit, async (req, res) => {
    const booking = await cancelBooking(ctx, { bookingId: idParam(req.params.id), user: req.user });
    res.json({ booking });
  });

  const withEvent = `, e.title AS event_title, e.slug AS event_slug, e.starts_at AS event_starts_at, e.ends_at AS event_ends_at,
    e.venue AS event_venue, e.status AS event_status, e.banner_url AS event_banner_url`;

  r.get('/me/bookings', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${BOOKING_COLS}${withEvent}
         FROM bookings b JOIN events e ON e.id = b.event_id
        WHERE b.user_id = $1 AND ($2::boolean OR b.status <> 'EXPIRED')
        ORDER BY b.id DESC LIMIT 100`,
      [req.user.id, req.query.all === 'true'],
    );
    res.json({ bookings: rows });
  });

  // Owner only. Someone else's booking id looks exactly like a missing one (404), so ids cannot be probed.
  r.get('/bookings/:id', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${BOOKING_COLS}${withEvent}, GREATEST(0, floor(extract(epoch FROM (b.hold_expires_at - now()))))::int AS hold_seconds_left
         FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = $1 AND b.user_id = $2`,
      [idParam(req.params.id), req.user.id],
    );
    if (!rows[0]) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    res.json({ booking: rows[0] });
  });

  // The QR ticket: a signed token. Only confirmed bookings have one.
  r.get('/bookings/:id/ticket', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT b.id, b.event_id, b.status FROM bookings b WHERE b.id = $1 AND b.user_id = $2`, [idParam(req.params.id), req.user.id]);
    if (!rows[0]) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    if (rows[0].status !== 'CONFIRMED') throw new AppError(409, 'NOT_CONFIRMED', 'Only confirmed bookings have a ticket.');
    res.json({ token: makeTicket(config, rows[0].id, rows[0].event_id), booking_id: rows[0].id });
  });

  return r;
}

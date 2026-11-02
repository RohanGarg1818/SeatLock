// Organizer operations on an event: live stats, registrations (paged + CSV), audit log, volunteers.
import { Router } from 'express';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import QueryStream from 'pg-query-stream';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { parse, idParam, limitParam, likePattern, emailSchema } from '../util.js';
import { requireRole } from '../middleware/auth.js';
import { getOwnedEvent } from '../ownership.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';
import { checkEvent } from '../services/integrity.js';

const STATUSES = ['HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED'];

// CSV cell escaping (RFC 4180) plus protection against spreadsheet formula injection:
// a cell that starts with = or @ (or + / - followed by something that is not a number/phone character)
// would be executed as a formula when opened in Excel, so we neutralise it with a leading apostrophe.
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=@\t\r]/.test(s) || /^[+-][^0-9 ().+-]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function eventOpsRouter(ctx, { requireAuth }) {
  const r = Router();
  const { pool } = ctx;
  const organizerOnly = [requireAuth, requireRole('organizer', 'admin')];

  // Re-derive the seat numbers from the bookings and compare (read-only; see services/integrity.js).
  r.get('/events/:id/integrity', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    await getOwnedEvent(pool, id, req.user);
    res.json({ integrity: await checkEvent(ctx, id) });
  });

  r.get('/events/:id/stats', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    const ev = await getOwnedEvent(pool, id, req.user);
    // One pass over this event's bookings using SQL aggregates (never count rows in JavaScript).
    const { rows } = await pool.query(
      `SELECT count(*) FILTER (WHERE status = 'HELD')::int      AS held,
              count(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed,
              count(*) FILTER (WHERE status = 'EXPIRED')::int   AS expired,
              count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
              count(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS checked_in
         FROM bookings WHERE event_id = $1`, [id]);
    // seats_left is re-read so it is as fresh as the counts.
    const seats = await pool.query('SELECT capacity, seats_left, status FROM events WHERE id = $1', [id]);
    const wl = await pool.query('SELECT count(*)::int AS n FROM waitlist WHERE event_id = $1', [id]);
    res.json({ stats: { ...rows[0], ...seats.rows[0], waitlist: wl.rows[0].n, title: ev.title } });
  });

  // GET /events/:id/registrations?after=<id>&limit=50&q=term&status=CONFIRMED,HELD
  // Keyset pagination: "give me rows after the last id I saw". Cost is constant however deep you page
  // (an OFFSET query must walk and discard all earlier rows), and rows inserted while paging are never skipped or repeated.
  r.get('/events/:id/registrations', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    await getOwnedEvent(pool, id, req.user);
    const limit = limitParam(req.query.limit, 50, 200);
    const after = req.query.after ? idParam(req.query.after, 'cursor') : '0';
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? likePattern(req.query.q.trim()) : null;
    const statuses = typeof req.query.status === 'string' && req.query.status ? req.query.status.split(',') : ['HELD', 'CONFIRMED', 'CANCELLED'];
    if (!statuses.every((s) => STATUSES.includes(s))) throw new AppError(400, 'BAD_REQUEST', 'Unknown status filter.');
    const { rows } = await pool.query(
      `SELECT b.id, b.status, b.answers, b.confirmed_at, b.checked_in_at, b.created_at, u.id AS user_id, u.name, u.email
         FROM bookings b JOIN users u ON u.id = b.user_id
        WHERE b.event_id = $1 AND b.id > $2 AND b.status = ANY($3::booking_status[])
          AND ($4::text IS NULL OR u.name ILIKE $4 OR u.email ILIKE $4)
        ORDER BY b.id LIMIT $5`,
      [id, after, statuses, q, limit + 1]); // fetch one extra row to know whether another page exists
    const page = rows.slice(0, limit);
    res.json({ registrations: page, next_cursor: rows.length > limit ? page.at(-1).id : null });
  });

  // GET /events/:id/registrations.csv — streamed straight from a Postgres cursor.
  // Memory stays flat (a few hundred rows at a time) whether the event has 50 registrations or 500,000.
  r.get('/events/:id/registrations.csv', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    const ev = await getOwnedEvent(pool, id, req.user); // all auth/404 errors happen BEFORE we start streaming
    const questions = ev.registration_questions;
    const header = ['booking_id', 'name', 'email', 'status', 'registered_at', 'checked_in_at', ...questions.map((q) => q.label)];

    const client = await pool.connect();
    let failed = false;
    try {
      const query = client.query(new QueryStream(
        `SELECT b.id, u.name, u.email, b.status, b.confirmed_at, b.checked_in_at, b.answers
           FROM bookings b JOIN users u ON u.id = b.user_id
          WHERE b.event_id = $1 AND b.status IN ('HELD','CONFIRMED','CANCELLED') ORDER BY b.id`, [id], { batchSize: 200 }));
      let wroteHeader = false;
      const toCsv = new Transform({
        writableObjectMode: true,
        transform(row, _enc, cb) {
          const cells = [row.id, row.name, row.email, row.status, row.confirmed_at, row.checked_in_at,
            ...questions.map((q) => row.answers?.[q.id])];
          let out = cells.map(csvCell).join(',') + '\r\n';
          if (!wroteHeader) { out = '﻿' + header.map(csvCell).join(',') + '\r\n' + out; wroteHeader = true; } // BOM: Excel reads UTF-8 names correctly
          cb(null, out);
        },
        flush(cb) { cb(null, wroteHeader ? '' : '﻿' + header.map(csvCell).join(',') + '\r\n'); },
      });
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${ev.slug}-registrations.csv"`);
      // pipeline handles backpressure (a slow client slows the DB read) and cleans everything up on error / client disconnect.
      await pipeline(query, toCsv, res);
    } catch (err) {
      failed = true;
      if (!res.headersSent) throw err;
      ctx.log.warn('csv export aborted', { err: err.message, eventId: id });
      res.destroy();
    } finally {
      client.release(failed); // on failure, drop the connection (a half-read cursor is not worth reusing)
    }
  });

  // GET /events/:id/audit?before=<id>&limit=50 — newest first.
  r.get('/events/:id/audit', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    await getOwnedEvent(pool, id, req.user);
    const limit = limitParam(req.query.limit, 50, 200);
    const before = req.query.before ? idParam(req.query.before, 'cursor') : null;
    const { rows } = await pool.query(
      `SELECT a.id, a.action, a.details, a.created_at, a.actor_id, u.name AS actor_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.entity_type = 'event' AND a.entity_id = $1 AND ($2::bigint IS NULL OR a.id < $2)
        ORDER BY a.id DESC LIMIT $3`, [id, before, limit + 1]);
    const page = rows.slice(0, limit);
    res.json({ entries: page, next_cursor: rows.length > limit ? page.at(-1).id : null });
  });

  // ---- volunteers -------------------------------------------------------------------------------
  r.get('/events/:id/staff', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    await getOwnedEvent(pool, id, req.user);
    const { rows } = await pool.query(
      `SELECT u.id AS user_id, u.name, u.email, s.role FROM event_staff s JOIN users u ON u.id = s.user_id WHERE s.event_id = $1 ORDER BY u.name`, [id]);
    res.json({ staff: rows });
  });

  r.post('/events/:id/staff', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const out = await tx(pool, async (c) => {
      await getOwnedEvent(c, id, req.user);
      const u = await c.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
      if (!u.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'No account with that email. Ask them to sign up first.');
      const ins = await c.query(
        `INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id`, [id, u.rows[0].id]);
      if (ins.rowCount) await audit(c, req.user.id, 'staff.add', 'event', id, { user_id: u.rows[0].id, email });
      return { created: ins.rowCount > 0, staff: { user_id: u.rows[0].id, name: u.rows[0].name, email: u.rows[0].email, role: 'volunteer' } };
    });
    res.status(out.created ? 201 : 200).json({ staff: out.staff });
  });

  r.delete('/events/:id/staff/:userId', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    const userId = idParam(req.params.userId, 'user id');
    await tx(pool, async (c) => {
      await getOwnedEvent(c, id, req.user);
      const del = await c.query('DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2', [id, userId]);
      if (!del.rowCount) throw new AppError(404, 'STAFF_NOT_FOUND', 'That user is not a volunteer for this event.');
      await audit(c, req.user.id, 'staff.remove', 'event', id, { user_id: userId });
    });
    res.status(204).end();
  });

  // Events where I am a volunteer (any logged-in user), so the scanner page can offer them.
  r.get('/me/staff-events', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.id, e.slug, e.title, e.starts_at, e.venue, e.status FROM event_staff s JOIN events e ON e.id = s.event_id
        WHERE s.user_id = $1 AND NOT e.is_demo ORDER BY e.starts_at DESC`, [req.user.id]);
    res.json({ events: rows });
  });

  return r;
}

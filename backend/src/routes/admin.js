import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { parse, idParam, limitParam, likePattern } from '../util.js';
import { requireRole } from '../middleware/auth.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';

export default function adminRouter(ctx, { requireAuth }) {
  const r = Router();
  const { pool } = ctx;
  const adminOnly = [requireAuth, requireRole('admin')];

  // GET /admin/users?q=term&after=<id>&limit=50 — keyset pagination, newest ids last.
  r.get('/admin/users', ...adminOnly, async (req, res) => {
    const limit = limitParam(req.query.limit, 50, 100);
    const after = req.query.after ? idParam(req.query.after, 'cursor') : '0';
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? likePattern(req.query.q.trim()) : null;
    const { rows } = await pool.query(
      `SELECT id, name, email, role, created_at FROM users
        WHERE id > $1 AND ($2::text IS NULL OR name ILIKE $2 OR email ILIKE $2)
        ORDER BY id LIMIT $3`,
      [after, q, limit + 1],
    );
    const page = rows.slice(0, limit);
    res.json({ users: page, next_cursor: rows.length > limit ? page.at(-1).id : null });
  });

  // GET /admin/stats — platform-wide numbers, each a SQL aggregate (never counted in JavaScript).
  r.get('/admin/stats', ...adminOnly, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM users) AS users,
         (SELECT count(*)::int FROM users WHERE role = 'organizer') AS organizers,
         (SELECT count(*)::int FROM users WHERE role = 'admin') AS admins,
         (SELECT count(*)::int FROM events WHERE NOT is_demo) AS events,
         (SELECT count(*)::int FROM events WHERE NOT is_demo AND status = 'PUBLISHED' AND ends_at > now()) AS live_events,
         (SELECT count(*)::int FROM events WHERE NOT is_demo AND status = 'DRAFT') AS draft_events,
         (SELECT count(*)::int FROM bookings b JOIN events e ON e.id = b.event_id WHERE NOT e.is_demo AND b.status = 'CONFIRMED') AS registrations,
         (SELECT count(*)::int FROM bookings b JOIN events e ON e.id = b.event_id WHERE NOT e.is_demo AND b.status = 'HELD') AS holds,
         (SELECT count(*)::int FROM bookings b JOIN events e ON e.id = b.event_id WHERE NOT e.is_demo AND b.checked_in_at IS NOT NULL) AS checked_in,
         (SELECT count(*)::int FROM waitlist w JOIN events e ON e.id = w.event_id WHERE NOT e.is_demo) AS waitlisted`);
    res.json({ stats: rows[0] });
  });

  // GET /admin/events?before=<id>&limit=50 — every organizer's events, newest first (keyset).
  r.get('/admin/events', ...adminOnly, async (req, res) => {
    const limit = limitParam(req.query.limit, 50, 100);
    const before = req.query.before ? idParam(req.query.before, 'cursor') : null;
    const { rows } = await pool.query(
      `SELECT e.id, e.slug, e.title, e.status, e.starts_at, e.capacity, e.seats_left, u.name AS organizer_name, u.email AS organizer_email,
              (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status = 'CONFIRMED') AS confirmed_count,
              (SELECT count(*)::int FROM waitlist w WHERE w.event_id = e.id) AS waitlist_count
         FROM events e JOIN users u ON u.id = e.organizer_id
        WHERE NOT e.is_demo AND ($1::bigint IS NULL OR e.id < $1)
        ORDER BY e.id DESC LIMIT $2`, [before, limit + 1]);
    const page = rows.slice(0, limit);
    res.json({ events: page, next_cursor: rows.length > limit ? page.at(-1).id : null });
  });

  const roleSchema = z.object({ role: z.enum(['participant', 'organizer', 'admin']) });

  r.patch('/admin/users/:id/role', ...adminOnly, async (req, res) => {
    const userId = idParam(req.params.id);
    const { role } = parse(roleSchema, req.body);
    // An admin demoting themselves could leave the platform with no admin at all.
    if (userId === req.user.id && role !== 'admin') {
      throw new AppError(409, 'CANNOT_DEMOTE_SELF', 'Ask another admin to change your role.');
    }
    const user = await tx(pool, async (c) => {
      const before = await c.query('SELECT role FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!before.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'No such user.');
      const { rows } = await c.query('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, name, email, role', [userId, role]);
      await audit(c, req.user.id, 'user.role_change', 'user', userId, { from: before.rows[0].role, to: role });
      return rows[0];
    });
    res.json({ user });
  });

  return r;
}

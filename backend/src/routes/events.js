// Organizer-side event management. Every state change is a conditional UPDATE and every action
// writes its audit row in the same transaction.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { parse, idParam, EVENT_COLS } from '../util.js';
import { questionsSchema, checkQuestionEditAllowed } from '../questions.js';
import { tx } from '../db.js';
import { audit } from '../audit.js';
import { getOwnedEvent } from '../ownership.js';
import { promoteWaitlist, afterPromotion } from '../services/waitlist.js';

const isoDate = z.iso.datetime({ offset: true });
const domain = z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Not a valid domain');

const fields = {
  title: z.string().trim().min(1).max(150),
  tagline: z.string().trim().max(200),
  description_md: z.string().max(20000),
  venue: z.string().trim().min(1).max(200),
  mode: z.enum(['offline', 'online', 'hybrid']),
  starts_at: isoDate,
  ends_at: isoDate,
  registration_opens_at: isoDate,
  registration_closes_at: isoDate.nullable(),
  hold_minutes: z.number().int().min(1).max(60),
  // [] and null both mean "anyone may register".
  allowed_email_domains: z.array(domain).max(10).nullable().transform((d) => (d && d.length ? d : null)),
  registration_questions: questionsSchema,
  banner_url: z.url({ protocol: /^https$/ }).max(500).nullable(), // https only: blocks javascript: URLs
};

const orderChecks = (v, ctx) => {
  const t = (s) => Date.parse(s);
  if (v.starts_at && v.ends_at && t(v.ends_at) <= t(v.starts_at)) ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'Must be after starts_at' });
  if (v.registration_opens_at && v.registration_closes_at && t(v.registration_closes_at) <= t(v.registration_opens_at)) {
    ctx.addIssue({ code: 'custom', path: ['registration_closes_at'], message: 'Must be after registration_opens_at' });
  }
};

const createSchema = z.object({
  title: fields.title,
  tagline: fields.tagline.default(''),
  description_md: fields.description_md.default(''),
  venue: fields.venue,
  mode: fields.mode.default('offline'),
  starts_at: fields.starts_at,
  ends_at: fields.ends_at,
  registration_opens_at: fields.registration_opens_at,
  registration_closes_at: fields.registration_closes_at.optional().default(null),
  capacity: z.number().int().min(1).max(100000),
  hold_minutes: fields.hold_minutes.default(5),
  allowed_email_domains: fields.allowed_email_domains.optional().default(null),
  registration_questions: fields.registration_questions.default([]),
  banner_url: fields.banner_url.optional().default(null),
}).superRefine(orderChecks);

// Capacity and status are NOT editable here; they have their own endpoints so each is audited and guarded.
const patchSchema = z.object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()]))).strict()
  .superRefine(orderChecks);

const EDITABLE = Object.keys(fields);

function slugify(title) {
  const base = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return base || 'event';
}

export default function eventsRouter(ctx, { requireOrganizer }) {
  const r = Router();
  const { pool } = ctx;
  const organizerOnly = [requireOrganizer]; // organizer portal session only

  // ---- list / read ------------------------------------------------------------------------
  r.get('/events', ...organizerOnly, async (req, res) => {
    const all = req.user.role === 'admin' && req.query.all === 'true';
    const { rows } = await pool.query(
      `SELECT ${EVENT_COLS},
              (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status = 'CONFIRMED') AS confirmed_count,
              (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status = 'HELD') AS held_count,
              (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.checked_in_at IS NOT NULL) AS checked_in_count
         FROM events e WHERE NOT e.is_demo AND ($1::boolean OR e.organizer_id = $2)
        ORDER BY e.id DESC LIMIT 200`,
      [all, req.user.id],
    );
    res.json({ events: rows });
  });

  r.get('/events/:id', ...organizerOnly, async (req, res) => {
    res.json({ event: await getOwnedEvent(pool, idParam(req.params.id), req.user) });
  });

  // ---- create ------------------------------------------------------------------------------
  r.post('/events', ...organizerOnly, async (req, res) => {
    const v = parse(createSchema, req.body);
    const event = await tx(pool, async (c) => {
      // Slug: readable, URL-safe. On collision we append a short random suffix and try again.
      // The UNIQUE constraint is what really prevents duplicates (two simultaneous creates would race a SELECT).
      let slug = slugify(v.title);
      for (let attempt = 0; ; attempt++) {
        await c.query('SAVEPOINT slug_try'); // a failed INSERT aborts the transaction unless we roll back to here
        try {
          const { rows } = await c.query(
            `INSERT INTO events AS e (organizer_id, slug, title, tagline, description_md, venue, mode, starts_at, ends_at,
                                  registration_opens_at, registration_closes_at, capacity, seats_left, hold_minutes,
                                  allowed_email_domains, registration_questions, banner_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14,$15,$16)
             RETURNING ${EVENT_COLS}`,
            [req.user.id, slug, v.title, v.tagline, v.description_md, v.venue, v.mode, v.starts_at, v.ends_at,
              v.registration_opens_at, v.registration_closes_at, v.capacity, v.hold_minutes, v.allowed_email_domains,
              JSON.stringify(v.registration_questions), v.banner_url],
          );
          await c.query('RELEASE SAVEPOINT slug_try');
          await audit(c, req.user.id, 'event.create', 'event', rows[0].id, { title: v.title, slug });
          return rows[0];
        } catch (err) {
          await c.query('ROLLBACK TO SAVEPOINT slug_try');
          if (err.code === '23505' && err.constraint === 'events_slug_key' && attempt < 5) {
            slug = `${slugify(v.title)}-${randomBytes(3).toString('hex')}`;
            continue;
          }
          throw err;
        }
      }
    });
    res.status(201).json({ event });
  });

  // ---- edit ---------------------------------------------------------------------------------
  r.patch('/events/:id', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    const patch = parse(patchSchema, req.body);
    const changed = Object.keys(patch).filter((k) => EDITABLE.includes(k));
    if (!changed.length) throw new AppError(422, 'VALIDATION_FAILED', 'Nothing to update.');

    const event = await tx(pool, async (c) => {
      // Lock the event row: a concurrent first booking must either finish before we check, or wait for us.
      const ev = await getOwnedEvent(c, id, req.user, { lock: true });
      if (!['DRAFT', 'PUBLISHED'].includes(ev.status)) throw new AppError(409, 'EVENT_NOT_EDITABLE', `A ${ev.status.toLowerCase()} event cannot be edited.`);

      // Cross-field checks against the merged result (the DB CHECKs are the backstop).
      const merged = { ...ev, ...patch };
      const bad = [];
      if (Date.parse(merged.ends_at) <= Date.parse(merged.starts_at)) bad.push(['ends_at', 'Must be after starts_at']);
      if (merged.registration_closes_at && Date.parse(merged.registration_closes_at) <= Date.parse(merged.registration_opens_at)) bad.push(['registration_closes_at', 'Must be after registration_opens_at']);
      if (bad.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', { fields: Object.fromEntries(bad) });

      if (patch.registration_questions) {
        const { rows } = await c.query('SELECT 1 FROM bookings WHERE event_id = $1 LIMIT 1', [id]);
        if (rows.length) {
          const problem = checkQuestionEditAllowed(ev.registration_questions, patch.registration_questions);
          if (problem) throw new AppError(409, 'QUESTIONS_LOCKED', problem);
        }
      }

      // Column names come from our own whitelist (EDITABLE), never from the request, so this is injection-safe.
      const sets = changed.map((k, i) => `${k} = $${i + 2}${k === 'registration_questions' ? '::jsonb' : ''}`);
      const values = changed.map((k) => (k === 'registration_questions' ? JSON.stringify(patch[k]) : patch[k]));
      const { rows } = await c.query(
        `UPDATE events e SET ${sets.join(', ')}, updated_at = now() WHERE e.id = $1 RETURNING ${EVENT_COLS}`, [id, ...values]);
      await audit(c, req.user.id, 'event.update', 'event', id, { fields: changed });
      return rows[0];
    });
    res.json({ event });
  });

  // ---- publish ------------------------------------------------------------------------------
  r.post('/events/:id/publish', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    const event = await tx(pool, async (c) => {
      const ev = await getOwnedEvent(c, id, req.user, { lock: true });
      if (ev.status !== 'DRAFT') throw new AppError(409, 'INVALID_STATE', `Only a draft can be published (this event is ${ev.status}).`);
      const missing = {};
      if (!ev.description_md.trim()) missing.description_md = 'Add a description before publishing';
      if (Date.parse(ev.ends_at) <= Date.now()) missing.ends_at = 'The event is already over';
      if (ev.registration_closes_at && Date.parse(ev.registration_closes_at) > Date.parse(ev.ends_at)) missing.registration_closes_at = 'Registration must close before the event ends';
      if (Object.keys(missing).length) throw new AppError(422, 'INCOMPLETE_EVENT', 'This event is not ready to publish.', { fields: missing });

      // Conditional UPDATE: if someone else changed the status meanwhile, this matches nothing.
      const { rows } = await c.query(
        `UPDATE events e SET status = 'PUBLISHED', updated_at = now() WHERE e.id = $1 AND e.status = 'DRAFT' RETURNING ${EVENT_COLS}`, [id]);
      if (!rows[0]) throw new AppError(409, 'INVALID_STATE', 'The event changed while publishing. Reload and retry.');
      await audit(c, req.user.id, 'event.publish', 'event', id, { slug: ev.slug });
      return rows[0];
    });
    await ctx.redis?.initEvent(id); // after commit: Redis only ever mirrors committed Postgres state
    res.json({ event });
  });

  // ---- capacity ------------------------------------------------------------------------------
  const capacitySchema = z.object({ capacity: z.number().int().min(1).max(100000) });
  r.patch('/events/:id/capacity', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    const { capacity } = parse(capacitySchema, req.body);
    const result = await tx(pool, async (c) => {
      const before = await getOwnedEvent(c, id, req.user, { lock: true });
      // One statement adjusts BOTH columns by the same difference. In an UPDATE, every column reference on
      // the right-hand side sees the OLD row, so seats_left + (new - old capacity) is exact even if bookings
      // are happening concurrently. If it would push seats_left below zero (capacity below active bookings),
      // the events_seats_range CHECK fails and the error handler answers 409.
      const { rows } = await c.query(
        `UPDATE events e SET seats_left = seats_left + ($2::int - capacity), capacity = $2::int, updated_at = now()
          WHERE e.id = $1 AND e.status IN ('DRAFT', 'PUBLISHED')
          RETURNING ${EVENT_COLS}`, [id, capacity]);
      if (!rows[0]) throw new AppError(409, 'EVENT_NOT_EDITABLE', 'Capacity can only change on draft or published events.');
      await audit(c, req.user.id, 'event.capacity', 'event', id, { from: before.capacity, to: capacity });
      // New seats go to the waitlist first (in this same transaction).
      const promoted = await promoteWaitlist(c, id, { holdMinutes: ctx.config.waitlistHoldMinutes });
      return { event: rows[0], promoted };
    });
    await ctx.redis?.syncEvent(id);
    await afterPromotion(ctx, id, result.promoted);
    res.json({ event: (await pool.query(`SELECT ${EVENT_COLS} FROM events e WHERE e.id = $1`, [id])).rows[0] });
  });

  // ---- cancel / complete / delete -------------------------------------------------------------
  r.post('/events/:id/cancel', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    const out = await tx(pool, async (c) => {
      const ev = await getOwnedEvent(c, id, req.user, { lock: true });
      const up = await c.query(`UPDATE events SET status = 'CANCELLED', updated_at = now() WHERE id = $1 AND status = 'PUBLISHED' RETURNING id`, [id]);
      if (!up.rowCount) throw new AppError(409, 'INVALID_STATE', `Only a published event can be cancelled (this one is ${ev.status}).`);
      const cancelled = await c.query(
        `UPDATE bookings SET status = 'CANCELLED', updated_at = now() WHERE event_id = $1 AND status IN ('HELD','CONFIRMED') RETURNING id`, [id]);
      // Every active booking was just cancelled, so every seat is free again.
      await c.query('UPDATE events SET seats_left = capacity WHERE id = $1', [id]);
      await c.query('DELETE FROM waitlist WHERE event_id = $1', [id]);
      await audit(c, req.user.id, 'event.cancel', 'event', id, { bookings_cancelled: cancelled.rowCount });
      return { bookings_cancelled: cancelled.rowCount };
    });
    await ctx.redis?.dropEvent(id);
    res.json({ status: 'CANCELLED', ...out });
  });

  r.post('/events/:id/complete', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    await tx(pool, async (c) => {
      const ev = await getOwnedEvent(c, id, req.user, { lock: true });
      const up = await c.query(`UPDATE events SET status = 'COMPLETED', updated_at = now() WHERE id = $1 AND status = 'PUBLISHED' RETURNING id`, [id]);
      if (!up.rowCount) throw new AppError(409, 'INVALID_STATE', `Only a published event can be completed (this one is ${ev.status}).`);
      await c.query('DELETE FROM waitlist WHERE event_id = $1', [id]);
      await audit(c, req.user.id, 'event.complete', 'event', id, {});
    });
    await ctx.redis?.dropEvent(id);
    res.json({ status: 'COMPLETED' });
  });

  r.delete('/events/:id', ...organizerOnly, async (req, res) => {
    const id = idParam(req.params.id);
    await tx(pool, async (c) => {
      const ev = await getOwnedEvent(c, id, req.user, { lock: true });
      const del = await c.query(`DELETE FROM events WHERE id = $1 AND status = 'DRAFT'`, [id]);
      if (!del.rowCount) throw new AppError(409, 'INVALID_STATE', `Only drafts can be deleted (this one is ${ev.status}). Cancel it instead.`);
      await audit(c, req.user.id, 'event.delete', 'event', id, { title: ev.title });
    });
    res.status(204).end();
  });

  return r;
}

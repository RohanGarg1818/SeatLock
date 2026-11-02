// Demo-only endpoints. The router is only mounted when ENABLE_DEMO=true (see app.js).
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { parse, idParam } from '../util.js';
import { requireRole } from '../middleware/auth.js';
import { runRace } from '../services/raceDemo.js';
import { runChaos } from '../services/chaos.js';
import { audit } from '../audit.js';
import { tx } from '../db.js';

export default function demoRouter(ctx, { requireAuth }) {
  const r = Router();
  const { pool } = ctx;

  // ---------------------------------------------------------------------------------------
  // THE BUG, ON PURPOSE.  This is the classic "read, think, write back" lost update.
  //
  //   request A: SELECT seats_left  -> 1
  //   request B: SELECT seats_left  -> 1      (A has not written yet, so B sees the same stale value)
  //   request A: UPDATE seats_left = 1 - 1 = 0   + INSERT booking
  //   request B: UPDATE seats_left = 1 - 1 = 0   + INSERT booking   <-- B overwrites with a value
  //                                                                     computed from the stale read
  // Two seats were handed out but the counter only moved once. With hundreds of concurrent
  // requests the counter barely moves while bookings pile up far past capacity.
  // The real endpoint (services/hold.js) fixes this by making the check and the decrement ONE statement.
  // ---------------------------------------------------------------------------------------
  r.post('/demo/events/:id/book-naive', requireAuth, async (req, res) => {
    const eventId = idParam(req.params.id);
    const read = await pool.query('SELECT seats_left FROM events WHERE id = $1 AND is_demo', [eventId]);
    if (!read.rows[0]) throw new AppError(404, 'EVENT_NOT_FOUND', 'Demo event not found.');
    const seatsLeft = read.rows[0].seats_left;
    if (seatsLeft <= 0) throw new AppError(409, 'SOLD_OUT', 'No seats left.');

    // ...time passes here (network hop, validation, another query). Others read the same value meanwhile.
    await pool.query('UPDATE events SET seats_left = $2 WHERE id = $1', [eventId, seatsLeft - 1]);
    const ins = await pool.query(
      `INSERT INTO bookings (event_id, user_id, status, hold_expires_at, idempotency_key)
       VALUES ($1, $2, 'HELD', now() + interval '30 minutes', $3) RETURNING id`,
      [eventId, req.user.id, req.get('idempotency-key') || 'naive'],
    );
    res.status(201).json({ booking_id: ins.rows[0].id });
  });

  const raceSchema = z.object({
    mode: z.enum(['naive', 'atomic']),
    capacity: z.number().int().min(1).max(200),
    requests: z.number().int().min(1).max(1000),
  });

  r.post('/demo/race', requireAuth, requireRole('organizer', 'admin'), async (req, res) => {
    const body = parse(raceSchema, req.body);
    const baseUrl = `http://127.0.0.1:${req.socket.localPort}`;
    const result = await runRace(ctx, { ...body, baseUrl, organizerId: req.user.id });
    await tx(pool, (c) => audit(c, req.user.id, 'demo.race', 'demo', result.event_id, { mode: body.mode, capacity: body.capacity, requests: body.requests, invariant_held: result.invariant_held }));
    res.json(result);
  });

  const chaosSchema = z.object({
    capacity: z.number().int().min(1).max(200),
    users: z.number().int().min(2).max(500),
    retry_storm: z.boolean().default(false),
    multi_tab: z.boolean().default(false),
    redis_outage: z.boolean().default(false),
    waitlist: z.boolean().default(false),
    cancel_churn: z.boolean().default(false),
    expire_holds: z.boolean().default(false),
    sabotage: z.boolean().default(false),
  });

  // One experiment at a time: two chaos runs in parallel would fight over the shared Redis switch.
  let chaosRunning = false;
  r.post('/demo/chaos', requireAuth, requireRole('organizer', 'admin'), async (req, res) => {
    const body = parse(chaosSchema, req.body);
    if (chaosRunning) throw new AppError(409, 'CHAOS_BUSY', 'Another experiment is still running. Try again in a moment.');
    chaosRunning = true;
    try {
      const baseUrl = `http://127.0.0.1:${req.socket.localPort}`;
      const result = await runChaos(ctx, { ...body, baseUrl, organizerId: req.user.id });
      await tx(pool, (c) => audit(c, req.user.id, 'demo.chaos', 'demo', result.event_id, { options: result.options, passed: result.passed }));
      res.json(result);
    } finally { chaosRunning = false; }
  });

  return r;
}

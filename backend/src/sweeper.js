// Hold-expiry sweeper. Runs inside every API process; safe with several running at once.
//
// FOR UPDATE SKIP LOCKED: each sweeper locks the batch of expired holds it picks and silently skips
// rows another sweeper has already locked, so two sweepers never process the same booking and a seat
// is never released twice. The status change and the seat release are ONE statement, so they commit together.
//
// We deliberately do NOT use Redis key-expiry notifications to release seats: they are fire-and-forget
// (a missed message is lost forever). This query is idempotent and self-healing: whatever was missed
// is simply picked up on the next run.
import { tx } from './db.js';
import { promoteWaitlist, afterPromotion } from './services/waitlist.js';

const SWEEP_SQL = `
  WITH expired AS (
    UPDATE bookings SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'HELD' AND id IN (
       SELECT id FROM bookings
        WHERE status = 'HELD' AND hold_expires_at < now()
        ORDER BY hold_expires_at
        FOR UPDATE SKIP LOCKED
        LIMIT 500)
    RETURNING event_id, user_id),
  released AS (
    UPDATE events e SET seats_left = e.seats_left + c.n, updated_at = now()
      FROM (SELECT event_id, count(*)::int AS n FROM expired GROUP BY event_id ORDER BY event_id) c
     WHERE e.id = c.event_id
    RETURNING e.id)
  SELECT event_id, user_id FROM expired`;

/** One sweep pass. Returns the number of holds expired. */
export async function sweepOnce(ctx) {
  const { rows, promotions } = await tx(ctx.pool, async (c) => {
    const res = await c.query(SWEEP_SQL);
    // Freed seats go to waiting people in the same transaction (one pass per affected event, in id order so two
    // sweepers lock events in the same order).
    const promotions = new Map();
    for (const eventId of [...new Set(res.rows.map((r) => r.event_id))].sort((a, b) => Number(a) - Number(b))) {
      const promoted = await promoteWaitlist(c, eventId, { holdMinutes: ctx.config.waitlistHoldMinutes });
      if (promoted.length) promotions.set(eventId, promoted);
    }
    return { rows: res.rows, promotions };
  });
  for (const [eventId, promoted] of promotions) await afterPromotion(ctx, eventId, promoted);
  if (rows.length && ctx.redis) {
    // After commit: tell Redis the seats are back.
    const byEvent = new Map();
    for (const { event_id, user_id } of rows) byEvent.set(event_id, [...(byEvent.get(event_id) || []), user_id]);
    for (const [eventId, userIds] of byEvent) if (!promotions.has(eventId)) await ctx.redis.seatsReturned(eventId, userIds);
  }
  return rows.length;
}

export function startSweeper(ctx) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // never overlap with our own previous run
    running = true;
    try {
      // Drain: keep going while full batches come back.
      let n;
      do {
        n = await sweepOnce(ctx);
        if (n) ctx.log.info('sweeper expired holds', { count: n });
      } while (n >= 500);
    } catch (err) {
      ctx.log.error('sweeper failed', { err: err.message });
    } finally {
      running = false;
    }
  }, ctx.config.sweepIntervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

// Chaos Lab: fire a crowd at a throwaway event while deliberately breaking things, then ask the
// integrity checker whether the seat rules survived. Every request goes through the real HTTP API
// (same code path as a real student), nothing is mocked.
//
// Failures you can switch on:
//   retry_storm   every person sends the SAME request 3 times at once (double click, flaky network retry)
//   multi_tab     every person also sends a second request with a DIFFERENT key (two browser tabs)
//   redis_outage  Redis is switched off for the middle of the rush, then back on (cache dies mid-sale)
//   waitlist      people who got "sold out" join the waitlist
//   cancel_churn  30% of the winners cancel while the losers retry
//   expire_holds  25% of the holds are forced to time out and the sweeper runs
//   sabotage      swap the real booking code for the deliberately broken one: the verdict MUST turn red
//                 (this is how you show the checker is not rigged)
import { randomBytes } from 'node:crypto';
import { signToken } from '../middleware/auth.js';
import { sweepOnce } from '../sweeper.js';
import { checkEvent } from './integrity.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runChaos(ctx, opts) {
  const { pool, config } = ctx;
  const { capacity, users: userCount, baseUrl, organizerId } = opts;
  const runId = randomBytes(4).toString('hex');
  const started = Date.now();
  const timeline = [];
  const note = (step, detail) => timeline.push({ step, detail, at_ms: Date.now() - started });
  const codes = {};
  const tally = (status) => { codes[status] = (codes[status] || 0) + 1; };

  const ev = await pool.query(
    `INSERT INTO events (organizer_id, slug, title, venue, starts_at, ends_at, registration_opens_at, capacity, seats_left, hold_minutes, status, is_demo)
     VALUES ($1, $2, 'Chaos Lab', 'Nowhere', now() + interval '1 day', now() + interval '2 days', now() - interval '1 minute', $3, $3, 30, 'PUBLISHED', true)
     RETURNING id`, [organizerId, `demo-chaos-${runId}`, capacity]);
  const eventId = ev.rows[0].id;
  const people = (await pool.query(
    `INSERT INTO users (name, email, password_hash)
     SELECT 'Chaos User ' || g, 'chaos-' || $1 || '-' || g || '@demo.invalid', 'x' FROM generate_series(1, $2) g
     RETURNING id, name, email, role`, [runId, userCount])).rows;
  await ctx.redis?.initEvent(eventId);

  const call = async (person, method, path, key) => {
    try {
      const r = await fetch(baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${signToken(config, person)}`, ...(key ? { 'Idempotency-Key': key } : {}) },
      });
      const body = await r.json().catch(() => null);
      tally(`${method} ${path.split('/').slice(-1)[0]} ${r.status}`);
      return { status: r.status, body };
    } catch {
      tally('network_error');
      return { status: 0, body: null };
    }
  };
  // sabotage = use the deliberately broken read-then-write endpoint, to prove the checker can FAIL.
  const hold = (p, key) => call(p, 'POST', opts.sabotage ? `/demo/events/${eventId}/book-naive` : `/events/${eventId}/hold`, key);
  const stats = { created: 0 };
  const owns = new Map(); // person.id -> booking id of a seat they won

  const savedRedis = ctx.redis;
  try {
    // 1. THE RUSH
    note('rush', `${userCount} people go for ${capacity} seats at the same instant${opts.retry_storm ? ', each sending the request 3 times' : ''}${opts.multi_tab ? ', each also from a second tab' : ''}`);
    const outage = opts.redis_outage && savedRedis
      ? (async () => { await sleep(25); ctx.redis = null; note('redis_outage', 'Redis switched OFF in the middle of the rush'); await sleep(120); ctx.redis = savedRedis; note('redis_outage', 'Redis back ON (its counters are now stale)'); })()
      : null;
    const losers = new Set();
    await Promise.all([
      outage,
      ...people.map(async (p, i) => {
        const key = `chaos-${runId}-${i}`;
        const tries = [hold(p, key)];
        if (opts.retry_storm) tries.push(hold(p, key), hold(p, key));
        if (opts.multi_tab) tries.push(hold(p, `${key}-tab2`));
        const results = await Promise.all(tries);
        for (const r of results) {
          if (r.status === 201) { stats.created++; owns.set(p.id, r.body.booking?.id ?? r.body.booking_id); }
          else if (r.status === 200 && r.body?.booking) owns.set(p.id, r.body.booking.id);
        }
        if (!owns.has(p.id)) losers.add(p);
      }),
    ]);
    ctx.redis = savedRedis;
    note('rush done', `${owns.size} people hold a seat, ${losers.size} were turned away`);

    // 2. WAITLIST
    if (opts.waitlist) {
      await Promise.all([...losers].map((p) => call(p, 'POST', `/events/${eventId}/waitlist`)));
      note('waitlist', `${losers.size} turned-away people joined the waitlist`);
    }

    // 3. CANCEL CHURN (winners cancel while losers keep trying)
    if (opts.cancel_churn) {
      const cancellers = [...owns.entries()].filter((_, i) => i % 10 < 3);
      note('cancel_churn', `${cancellers.length} winners cancel while ${losers.size} others retry at the same time`);
      await Promise.all([
        ...cancellers.map(([uid, bid]) => call(people.find((p) => p.id === uid), 'POST', `/bookings/${bid}/cancel`)),
        ...[...losers].map((p) => hold(p, `chaos-${runId}-retry1-${p.id}`)),
      ]);
    }

    // 4. EXPIRY (holds time out, sweeper frees the seats, waiting people are promoted)
    if (opts.expire_holds) {
      const forced = await pool.query(
        `UPDATE bookings SET hold_expires_at = now() - interval '1 minute'
          WHERE id IN (SELECT id FROM bookings WHERE event_id = $1 AND status = 'HELD' ORDER BY id LIMIT (SELECT (count(*) * 0.25)::int FROM bookings WHERE event_id = $1 AND status = 'HELD'))`, [eventId]);
      note('expire_holds', `${forced.rowCount} holds forced to time out`);
      const [swept] = await Promise.all([
        // In sabotage mode the counter is already wrong, so freeing seats can hit the database CHECK (seats_left <= capacity).
        // That refusal is itself evidence, so it is reported instead of aborting the experiment.
        sweepOnce(ctx).catch((e) => { note('sweeper', `the database REFUSED the sweeper (${e.code === '23514' ? 'CHECK constraint seats_left <= capacity' : e.message}): the counter was already corrupt`); return null; }),
        ...[...losers].map((p) => hold(p, `chaos-${runId}-retry2-${p.id}`)),
      ]);
      if (swept !== null) note('sweeper', `sweeper ran while people kept clicking; it expired ${swept} hold(s) and freed the seats`);
    }

    // 5. SELF-HEALING, THEN THE VERDICT
    if (ctx.redis) { const r = await ctx.redis.reconcile(eventId); note('reconcile', `Redis checked against Postgres: ${r.checked} event(s) looked at, ${r.corrected} corrected`); }
    const report = await checkEvent(ctx, eventId);

    // Chaos-only accounting: with no waitlist every row must trace back to exactly one successful request.
    if (!opts.waitlist) {
      const rows = report.bookings_total;
      const ok = rows === stats.created;
      report.checks.push({ id: 'EVERY_SUCCESS_IS_ONE_ROW', title: 'Every "created" answer is exactly one booking',
        rule: 'number of 201 responses = number of booking rows (retries and second tabs never create extras)', expected: stats.created, actual: rows, ok });
      report.ok = report.ok && ok;
    }
    const final = await pool.query(`SELECT count(*) FILTER (WHERE status IN ('HELD','CONFIRMED'))::int AS active,
                                           count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
                                           count(*) FILTER (WHERE status = 'EXPIRED')::int AS expired FROM bookings WHERE event_id = $1`, [eventId]);
    return {
      options: { capacity, users: userCount, retry_storm: !!opts.retry_storm, multi_tab: !!opts.multi_tab, redis_outage: !!opts.redis_outage,
                 waitlist: !!opts.waitlist, cancel_churn: !!opts.cancel_churn, expire_holds: !!opts.expire_holds, sabotage: !!opts.sabotage },
      event_id: String(eventId),
      requests_sent: Object.values(codes).reduce((a, b) => a + b, 0),
      response_codes: codes,
      timeline,
      end_state: { ...final.rows[0], capacity },
      report,
      passed: report.ok,
      elapsed_ms: Date.now() - started,
    };
  } finally {
    ctx.redis = savedRedis;
    await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`chaos-${runId}-%@demo.invalid`]);
    await ctx.redis?.dropEvent(eventId);
  }
}

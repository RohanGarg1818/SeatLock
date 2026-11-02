// Shared test plumbing. Tests use a REAL Postgres (TEST_DATABASE_URL); the database is never mocked.
import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { createLogger } from '../src/logger.js';
import { createApp } from '../src/app.js';
import { createRedisLayer } from '../src/redisLayer.js';
import { createMailer } from '../src/mailer.js';
import { migrate } from '../db/migrate.js';
import { signToken } from '../src/middleware/auth.js';

const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) throw new Error('Set TEST_DATABASE_URL (see backend/.env.example).');
// Safety: tests TRUNCATE everything, so refuse to run against anything that is not obviously a test DB.
if (!/test/i.test(new URL(TEST_URL).pathname)) throw new Error('TEST_DATABASE_URL database name must contain "test".');

export const TEST_REDIS_URL = (process.env.REDIS_URL || 'redis://localhost:6379').replace(/\/\d*$/, '') + '/1';

export async function startTestApp({ redis = false, env = {}, logLines, reset = true } = {}) {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: TEST_URL,
    NODE_ENV: 'test',
    BCRYPT_COST: '4',
    ENABLE_DEMO: 'true',
    RATE_LIMIT_AUTH_PER_MIN: '100000',
    RATE_LIMIT_BOOKING_PER_MIN: '100000',
    REDIS_URL: redis ? TEST_REDIS_URL : '',
    REDIS_ENABLED: redis ? 'true' : 'false',
    SWEEP_INTERVAL_SECONDS: '3600', // tests call the sweeper explicitly
    ...env,
  });
  const pool = createPool(config);
  await migrate(pool, () => {});
  if (reset) await resetDb(pool);
  const log = createLogger({ level: logLines ? 'debug' : 'silent', write: logLines ? (l) => logLines.push(l) : undefined });
  const ctx = { config, pool, log, redis: null };
  ctx.mailer = createMailer(ctx);
  ctx.redis = createRedisLayer(ctx);
  if (ctx.redis) { await ctx.redis.waitReady(); if (reset) await ctx.redis.flush(); }
  const server = await new Promise((resolve) => { const s = createApp(ctx).listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ctx, pool, config, base, redis: ctx.redis,
    call: (method, path, opts) => call(base, method, path, opts),
    async close() {
      await new Promise((r) => server.close(r));
      await ctx.redis?.close();
      await pool.end();
    },
  };
}

export async function resetDb(pool) {
  await pool.query('TRUNCATE audit_log, event_staff, bookings, events, users RESTART IDENTITY CASCADE');
}

let counter = 0;
export async function createUser(app, { name, email, role = 'participant' } = {}) {
  counter++;
  const n = name || `User ${counter}`;
  const e = email || `user${counter}-${Date.now()}@test.dev`;
  // password_hash is a dummy: tests mint tokens directly (bcrypt on hundreds of users would be slow).
  const { rows } = await app.pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, name, email, role`, [n, e.toLowerCase(), role]);
  const user = rows[0];
  return { ...user, token: signToken(app.config, user) };
}

// A token for the ORGANIZER PORTAL session (what /organizer/auth/login hands out), e.g. for an admin acting as an organizer.
export const portalToken = (app, user) => signToken(app.config, user, 'organizer');

export async function createManyUsers(app, count, prefix = 'bulk') {
  const { rows } = await app.pool.query(
    `INSERT INTO users (name, email, password_hash)
     SELECT 'Bulk ' || g, $1 || '-' || g || '-' || $3 || '@test.dev', 'x'
       FROM generate_series(1, $2) g RETURNING id, name, email, role`, [prefix, count, `${Date.now()}${++counter}`]);
  return rows.map((u) => ({ ...u, token: signToken(app.config, u) }));
}

// Inserts an event directly (bypassing the API) for tests that focus on registration, not on event creation.
export async function createEvent(app, organizerId, o = {}) {
  const capacity = o.capacity ?? 20;
  const { rows } = await app.pool.query(
    `INSERT INTO events (organizer_id, slug, title, venue, starts_at, ends_at, registration_opens_at, registration_closes_at,
                         capacity, seats_left, hold_minutes, allowed_email_domains, registration_questions, status)
     VALUES ($1, $2, $3, 'Auditorium', now() + interval '2 days', now() + interval '3 days',
             ${o.opensSql ?? "now() - interval '1 hour'"}, ${o.closesSql ?? 'NULL'}, $4, $4, $5, $6, $7, $8)
     RETURNING *`,
    [organizerId, o.slug || `ev-${Math.random().toString(36).slice(2, 10)}`, o.title || 'Test Event', capacity,
      o.holdMinutes ?? 5, o.domains ?? null, JSON.stringify(o.questions ?? []), o.status ?? 'PUBLISHED']);
  const ev = rows[0];
  await app.ctx.redis?.initEvent(ev.id);
  return ev;
}

export async function call(base, method, path, { token, body, headers = {}, raw = false } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

export const hold = (app, eventId, user, key) =>
  app.call('POST', `/events/${eventId}/hold`, { token: user.token, headers: { 'Idempotency-Key': key ?? `k-${Math.random()}` } });

// THE core invariant. Every concurrency test ends by running this.
export async function checkInvariant(pool, eventId) {
  const { rows } = await pool.query(
    `SELECT e.capacity, e.seats_left,
            (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status IN ('HELD','CONFIRMED')) AS active
       FROM events e WHERE e.id = $1`, [eventId]);
  const r = rows[0];
  return { ...r, ok: r.active <= r.capacity && r.seats_left === r.capacity - r.active };
}

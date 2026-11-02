import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createManyUsers, createEvent, hold, checkInvariant } from './helpers.js';
import pg from 'pg';
import { sweepOnce } from '../src/sweeper.js';

let app, organizer;
const appLog = [];
before(async () => { app = await startTestApp({ redis: true, logLines: appLog }); organizer = await createUser(app, { role: 'organizer' }); });
after(() => app.close());

const raw = () => app.redis.raw;
const seatsKey = (id) => `event:{${id}}:seats`;
const holdersKey = (id) => `event:{${id}}:holders`;
const soldoutKey = (id) => `event:{${id}}:soldout`;
const redisSeats = async (id) => Number(await raw().get(seatsKey(id)));
const settle = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const expireHolds = (id) => app.pool.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE event_id = $1 AND status = 'HELD'`, [id]);

test('redis is connected and keys are initialised from Postgres', async () => {
  assert.ok(app.redis.isHealthy());
  const ev = await createEvent(app, organizer.id, { capacity: 7 });
  assert.equal(await redisSeats(ev.id), 7);
  const health = await app.call('GET', '/health');
  assert.deepEqual(health.body, { status: 'ok', postgres: 'ok', redis: 'ok' });
});

test('with Redis on: 300 simultaneous holds on 20 seats => exactly 20 succeed; Redis and Postgres agree afterwards', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 20 });
  const users = await createManyUsers(app, 300);
  const results = await Promise.all(users.map((u) => hold(app, ev.id, u)));
  assert.equal(results.filter((r) => r.status === 201).length, 20);
  assert.equal(results.filter((r) => r.status === 409 && r.body.error.code === 'SOLD_OUT').length, 280);
  await settle();
  const inv = await checkInvariant(app.pool, ev.id);
  assert.ok(inv.ok); assert.equal(inv.active, 20);
  assert.equal(await redisSeats(ev.id), 0);
  assert.equal(await raw().scard(holdersKey(ev.id)), 20);
});

test('sold-out fast path: once sold out, further requests are answered from Redis without a Postgres transaction', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 1 });
  const [winner, loser1, loser2] = await createManyUsers(app, 3, 'fast');
  assert.equal((await hold(app, ev.id, winner)).status, 201);
  await settle();
  assert.ok(await raw().get(soldoutKey(ev.id)), 'sold-out flag must be set once Postgres reports zero seats');
  // Record every SQL statement the process runs while the losers are rejected.
  const sql = []; const origQuery = pg.Client.prototype.query;
  pg.Client.prototype.query = function (text, ...rest) { sql.push(typeof text === 'string' ? text : text?.text); return origQuery.call(this, text, ...rest); };
  let r, r2;
  try { r = await hold(app, ev.id, loser1); r2 = await hold(app, ev.id, loser2); } finally { pg.Client.prototype.query = origQuery; }
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'SOLD_OUT'); assert.equal(r2.status, 409);
  // Only the authentication lookup (SELECT ... FROM users) may touch Postgres: no BEGIN, no seat UPDATE, no INSERT.
  assert.deepEqual(sql.filter((q) => !/FROM users WHERE id/.test(q)), [], 'sold-out rejection must not run any seat/booking SQL');
  // ...but the winner retrying (lost response) must still get their booking back, not SOLD_OUT.
  const again = await app.call('POST', `/events/${ev.id}/hold`, { token: winner.token, headers: { 'Idempotency-Key': 'whatever-new-key' } });
  assert.equal(again.status, 409); assert.equal(again.body.error.code, 'ALREADY_REGISTERED');
});

test('sold-out flag clears when a seat returns (cancel, expiry, capacity increase)', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 2 });
  const [a, b, c, d, e] = await createManyUsers(app, 5, 'ret');
  const ha = (await hold(app, ev.id, a)).body.booking.id; await hold(app, ev.id, b);
  await settle();
  assert.equal((await hold(app, ev.id, c)).status, 409);
  // cancel
  assert.equal((await app.call('POST', `/bookings/${ha}/cancel`, { token: a.token })).status, 200);
  assert.equal(await redisSeats(ev.id), 1); assert.equal(await raw().get(soldoutKey(ev.id)), null);
  assert.equal(await raw().sismember(holdersKey(ev.id), String(a.id)), 0);
  assert.equal((await hold(app, ev.id, c)).status, 201); await settle();
  assert.equal((await hold(app, ev.id, d)).status, 409); await settle();
  // expiry by the sweeper
  await expireHolds(ev.id);
  assert.equal(await sweepOnce(app.ctx), 2);
  assert.equal(await redisSeats(ev.id), 2); assert.equal(await raw().scard(holdersKey(ev.id)), 0);
  assert.equal((await hold(app, ev.id, d)).status, 201);
  assert.equal((await hold(app, ev.id, e)).status, 201); await settle();
  assert.equal((await hold(app, ev.id, a)).status, 409);
  // capacity increase
  assert.equal((await app.call('PATCH', `/events/${ev.id}/capacity`, { token: organizer.token, body: { capacity: 3 } })).status, 200);
  assert.equal(await redisSeats(ev.id), 1); assert.equal(await raw().get(soldoutKey(ev.id)), null);
  assert.equal((await hold(app, ev.id, a)).status, 201);
  assert.ok((await checkInvariant(app.pool, ev.id)).ok);
});

test('compensation: failures after Redis admitted a request put the seat and the user back', async () => {
  const closed = await createEvent(app, organizer.id, { capacity: 5, closesSql: "now() - interval '1 second'" });
  const notEligible = await createEvent(app, organizer.id, { capacity: 5, domains: ['ipu.ac.in'] });
  const u = await createUser(app, { email: 'someone@gmail.com' });
  assert.equal((await hold(app, closed.id, u)).status, 403);
  assert.equal((await hold(app, notEligible.id, u)).status, 403);
  for (const ev of [closed, notEligible]) {
    assert.equal(await redisSeats(ev.id), 5, 'seat must be restored');
    assert.equal(await raw().sismember(holdersKey(ev.id), String(u.id)), 0, 'user must not stay in holders');
  }
  // idempotent replay when Redis lost its holders set: the gate admits again, Postgres replays, the seat is given back
  const ev = await createEvent(app, organizer.id, { capacity: 5 });
  const v = await createUser(app);
  const first = await hold(app, ev.id, v, 'key-1');
  await raw().del(holdersKey(ev.id)); // simulate lost keys
  const replay = await hold(app, ev.id, v, 'key-1');
  assert.equal(replay.status, 200); assert.equal(replay.body.booking.id, first.body.booking.id);
  await settle();
  assert.equal(await redisSeats(ev.id), 4, 'replay must not consume a seat');
  assert.equal(await raw().sismember(holdersKey(ev.id), String(v.id)), 1, 'a user who really holds a seat stays recorded');
  assert.ok((await checkInvariant(app.pool, ev.id)).ok);
});

test('drift can only cause FALSE SOLD OUT, never overselling; reconciliation repairs it and logs the correction', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 5 });
  // Drift HIGH: Redis believes 1000 seats exist. Postgres must still stop at 5.
  await raw().set(seatsKey(ev.id), 1000);
  const users = await createManyUsers(app, 100, 'high');
  const res = await Promise.all(users.map((u) => hold(app, ev.id, u)));
  assert.equal(res.filter((r) => r.status === 201).length, 5);
  let inv = await checkInvariant(app.pool, ev.id); assert.ok(inv.ok); assert.equal(inv.active, 5);

  // Drift LOW: Redis believes the event is sold out while 5 seats are free => false "sold out" answers.
  const ev2 = await createEvent(app, organizer.id, { capacity: 5 });
  await raw().set(seatsKey(ev2.id), 0);
  const falseSoldOut = await hold(app, ev2.id, await createUser(app));
  assert.equal(falseSoldOut.status, 409);
  inv = await checkInvariant(app.pool, ev2.id); assert.equal(inv.active, 0); assert.ok(inv.ok);
  // Reconcile fixes it.
  const out = await app.redis.reconcile();
  assert.ok(out.corrected >= 2, `corrected ${out.corrected}`);
  const corrections = appLog.map((l) => JSON.parse(l)).filter((l) => l.msg === 'redis drift corrected');
  assert.ok(corrections.some((c) => c.eventId === ev2.id && c.redisSeats === 0 && c.pgSeatsLeft === 5), 'every correction is logged with both values');
  assert.equal(await redisSeats(ev2.id), 5);
  assert.equal(await redisSeats(ev.id), 0);
  assert.equal((await hold(app, ev2.id, await createUser(app))).status, 201);
});

test('uninitialised keys (Redis restarted / flushed): requests still correct, keys rebuilt lazily', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 10 });
  await raw().flushdb();
  const users = await createManyUsers(app, 40, 'flush');
  const res = await Promise.all(users.map((u) => hold(app, ev.id, u)));
  assert.equal(res.filter((r) => r.status === 201).length, 10);
  assert.ok((await checkInvariant(app.pool, ev.id)).ok);
  await settle(300);
  assert.equal(await raw().exists(seatsKey(ev.id)), 1, 'lazy init must recreate the counter');
  // The rebuilt counter is a snapshot taken while requests were in flight, so it may be briefly off;
  // reconciliation converges it (this is exactly what the periodic job is for).
  await app.redis.reconcile();
  assert.equal(await redisSeats(ev.id), 0);
  assert.equal(await raw().scard(holdersKey(ev.id)), 10);
});

test('two API instances sharing Redis and Postgres: exactly capacity succeed', async () => {
  const app2 = await startTestApp({ redis: true, reset: false });
  const ev = await createEvent(app, organizer.id, { capacity: 25 });
  const users = await createManyUsers(app, 200, 'twoinst');
  const hit = (i, u) => (i % 2 ? hold(app, ev.id, u) : app2.call('POST', `/events/${ev.id}/hold`, { token: u.token, headers: { 'Idempotency-Key': `k${i}` } }));
  const res = await Promise.all(users.map((u, i) => hit(i, u)));
  assert.equal(res.filter((r) => r.status === 201).length, 25);
  assert.ok((await checkInvariant(app.pool, ev.id)).ok);
  await app2.close();
});

test('event cancel drops the Redis keys; the Postgres path then explains why', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 3 });
  await app.call('POST', `/events/${ev.id}/cancel`, { token: organizer.token });
  assert.equal(await raw().exists(seatsKey(ev.id)), 0);
  const r = await hold(app, ev.id, await createUser(app));
  assert.equal(r.body.error.code, 'EVENT_CANCELLED');
});

test('rate limiting: per-IP on auth routes, per-user on booking routes; 429 with Retry-After; limits are shared via Redis', async () => {
  const a = await startTestApp({ redis: true, reset: false, env: { RATE_LIMIT_AUTH_PER_MIN: '3', RATE_LIMIT_BOOKING_PER_MIN: '4' } });
  const b = await startTestApp({ redis: true, reset: false, env: { RATE_LIMIT_AUTH_PER_MIN: '3', RATE_LIMIT_BOOKING_PER_MIN: '4' } });
  await a.redis.flush();
  const login = (x) => x.call('POST', '/auth/login', { body: { email: 'nobody@test.dev', password: 'whatever123' } });
  assert.equal((await login(a)).status, 401); assert.equal((await login(b)).status, 401); assert.equal((await login(a)).status, 401);
  const limited = await login(b); // 4th attempt across TWO instances
  assert.equal(limited.status, 429); assert.equal(limited.body.error.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  const u = await createUser(a); const v = await createUser(a);
  const ev = await createEvent(a, organizer.id, { capacity: 50 });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await hold(a, ev.id, u, `k${i}`)).status);
  assert.deepEqual(codes, [201, 409, 409, 409, 429, 429]);
  assert.equal((await hold(a, ev.id, v)).status, 201); // another user is unaffected
  await a.close(); await b.close();
});

test('rate limiting still works (per instance, in memory) without Redis', async () => {
  const a = await startTestApp({ reset: false, env: { RATE_LIMIT_AUTH_PER_MIN: '2' } });
  const login = () => a.call('POST', '/auth/login', { body: { email: 'nobody@test.dev', password: 'whatever123' } });
  assert.deepEqual([(await login()).status, (await login()).status, (await login()).status], [401, 401, 429]);
  await a.close();
});

test('Redis unreachable from the start: fully correct Postgres-only behaviour', async () => {
  const a = await startTestApp({ reset: false, redis: true, env: { REDIS_URL: 'redis://127.0.0.1:6399' } }); // nothing listens there
  assert.equal(a.redis.isHealthy(), false);
  const ev = await createEvent(a, organizer.id, { capacity: 10 });
  const users = await createManyUsers(a, 100, 'dead');
  const res = await Promise.all(users.map((u) => hold(a, ev.id, u)));
  assert.equal(res.filter((r) => r.status === 201).length, 10);
  assert.ok((await checkInvariant(a.pool, ev.id)).ok);
  const health = await a.call('GET', '/health');
  assert.equal(health.status, 200); assert.equal(health.body.redis, 'down'); assert.equal(health.body.postgres, 'ok');
  await a.close();
});

test('Redis dying mid-traffic: no errors, no overselling', async () => {
  const lines = [];
  const a = await startTestApp({ reset: false, redis: true, logLines: lines });
  const ev = await createEvent(a, organizer.id, { capacity: 30 });
  const users = await createManyUsers(a, 150, 'die');
  const first = await Promise.all(users.slice(0, 50).map((u) => hold(a, ev.id, u)));
  a.redis.killConnection(); // the cache vanishes
  const second = await Promise.all(users.slice(50).map((u) => hold(a, ev.id, u)));
  const all = [...first, ...second];
  assert.ok(all.every((r) => [201, 409].includes(r.status)), 'only 201 or 409 allowed, never a 5xx');
  assert.equal(all.filter((r) => r.status === 201).length, 30);
  assert.ok((await checkInvariant(a.pool, ev.id)).ok);
  assert.ok(lines.some((l) => /redis unavailable|falling back/.test(l)), 'the fallback must be logged');
  await a.close();
});

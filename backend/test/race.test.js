import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createManyUsers, createEvent, hold, checkInvariant } from './helpers.js';

let app, organizer;
before(async () => { app = await startTestApp(); organizer = await createUser(app, { role: 'organizer' }); });
after(() => app.close());

test('200 simultaneous holds on a 20-seat event: exactly 20 succeed', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 20 });
  const users = await createManyUsers(app, 200);
  const results = await Promise.all(users.map((u) => hold(app, ev.id, u)));
  const codes = results.map((r) => r.status);
  assert.equal(codes.filter((c) => c === 201).length, 20);
  assert.equal(codes.filter((c) => c === 409).length, 180);
  assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'SOLD_OUT'));
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.active, 20); assert.equal(inv.seats_left, 0); assert.ok(inv.ok);
});

test('naive demo endpoint really does oversell (the bug the demo exists to show)', async () => {
  const org = await createUser(app, { role: 'organizer' });
  const r = await app.call('POST', '/demo/race', { token: org.token, body: { mode: 'naive', capacity: 10, requests: 300 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.invariant_held, false, 'naive mode must violate the invariant');
  assert.ok(r.body.oversold_by > 0);
});

test('atomic demo mode keeps the invariant', async () => {
  const org = await createUser(app, { role: 'organizer' });
  const r = await app.call('POST', '/demo/race', { token: org.token, body: { mode: 'atomic', capacity: 10, requests: 300 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.invariant_held, true);
  assert.equal(r.body.bookings_created, 10);
  assert.equal(r.body.final_seats_left, 0);
});

test('demo data never leaks into public data afterwards', async () => {
  const { rows } = await app.pool.query(`SELECT count(*)::int AS n FROM events WHERE is_demo`);
  assert.equal(rows[0].n, 0);
});

test('same user, two different idempotency keys at once: exactly one succeeds', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 5 });
  const u = await createUser(app);
  const results = await Promise.all([hold(app, ev.id, u, 'a'), hold(app, ev.id, u, 'b'), hold(app, ev.id, u, 'c'), hold(app, ev.id, u, 'd')]);
  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, 409, 409, 409]);
  assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ALREADY_REGISTERED'));
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.active, 1); assert.equal(inv.seats_left, 4); assert.ok(inv.ok);
});

test('idempotent retry (same key twice, even concurrently) returns the same booking and consumes one seat', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 5 });
  const u = await createUser(app);
  const first = await hold(app, ev.id, u, 'same-key');
  const again = await hold(app, ev.id, u, 'same-key');
  assert.equal(first.status, 201); assert.equal(again.status, 200);
  assert.equal(again.body.booking.id, first.body.booking.id);

  const u2 = await createUser(app);
  const both = await Promise.all([hold(app, ev.id, u2, 'race-key'), hold(app, ev.id, u2, 'race-key')]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 201]);
  assert.equal(both[0].body.booking.id, both[1].body.booking.id);
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.active, 2); assert.ok(inv.ok);
});

test('same key for a different event returns 422; missing key returns 400', async () => {
  const e1 = await createEvent(app, organizer.id); const e2 = await createEvent(app, organizer.id);
  const u = await createUser(app);
  assert.equal((await hold(app, e1.id, u, 'reused')).status, 201);
  const r = await hold(app, e2.id, u, 'reused');
  assert.equal(r.status, 422); assert.equal(r.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
  const noKey = await app.call('POST', `/events/${e1.id}/hold`, { token: u.token });
  assert.equal(noKey.status, 400);
  const inv = await checkInvariant(app.pool, e2.id);
  assert.equal(inv.active, 0); assert.equal(inv.seats_left, e2.capacity);
});

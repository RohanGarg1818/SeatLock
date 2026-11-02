import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createEvent, createManyUsers, hold } from './helpers.js';
import { runChaos } from '../src/services/chaos.js';
import { checkEvent } from '../src/services/integrity.js';

let app, organizer, other, student;
before(async () => {
  app = await startTestApp({ redis: true });
  organizer = await createUser(app, { role: 'organizer' }); other = await createUser(app, { role: 'organizer' }); student = await createUser(app);
});
after(() => app.close());

const failing = (report) => report.checks.filter((c) => !c.ok).map((c) => `${c.id}: expected ${c.expected}, got ${c.actual}`);

test('integrity: a healthy event passes every check, including Redis agreement', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 3 });
  const users = await createManyUsers(app, 5);
  await Promise.all(users.map((u) => hold(app, ev.id, u)));
  const report = await checkEvent(app.ctx, ev.id);
  assert.deepEqual(failing(report), []);
  assert.equal(report.ok, true);
  assert.ok(report.checks.some((c) => c.id === 'REDIS_AGREES' && !c.skipped));
});

test('integrity: it actually catches corruption (a wrong counter, a waiting person who is also seated, a lying Redis)', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 3 });
  const h = await hold(app, ev.id, student);
  assert.equal(h.status, 201);

  await app.pool.query('UPDATE events SET seats_left = 3 WHERE id = $1', [ev.id]); // counter forgot the booking
  let report = await checkEvent(app.ctx, ev.id);
  assert.equal(report.ok, false);
  assert.ok(failing(report).some((f) => f.startsWith('COUNTER_EXACT')));
  await app.pool.query('UPDATE events SET seats_left = 2 WHERE id = $1', [ev.id]); // repair

  await app.pool.query('INSERT INTO waitlist (event_id, user_id) VALUES ($1, $2)', [ev.id, student.id]);
  report = await checkEvent(app.ctx, ev.id);
  assert.ok(failing(report).some((f) => f.startsWith('WAITING_HOLDS_NOTHING')));
  await app.pool.query('DELETE FROM waitlist WHERE event_id = $1', [ev.id]);

  await app.ctx.redis.syncEvent(ev.id);
  assert.equal((await checkEvent(app.ctx, ev.id)).ok, true);
  await app.pool.query('UPDATE events SET seats_left = 1, capacity = 3 WHERE id = $1', [ev.id]); // PG changes, Redis does not
  assert.ok(failing(await checkEvent(app.ctx, ev.id)).some((f) => f.startsWith('REDIS_AGREES')));
});

test('GET /events/:id/integrity: the owner and admins may run it, others may not', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 2 });
  const ok = await app.call('GET', `/events/${ev.id}/integrity`, { token: organizer.token });
  assert.equal(ok.status, 200); assert.equal(ok.body.integrity.ok, true);
  assert.equal((await app.call('GET', `/events/${ev.id}/integrity`, { token: other.token })).status, 404);
  assert.equal((await app.call('GET', `/events/${ev.id}/integrity`, { token: student.token })).status, 401);
  assert.equal((await app.call('GET', `/events/${ev.id}/integrity`)).status, 401);
});

const ALL = { retry_storm: true, multi_tab: true, redis_outage: true, waitlist: true, cancel_churn: true, expire_holds: true };
const scenarios = [
  ['no failures injected', {}],
  ['double-click storm + second tab', { retry_storm: true, multi_tab: true }],
  ['Redis dies mid-rush', { redis_outage: true }],
  ['cancellations and expiries with a waitlist', { waitlist: true, cancel_churn: true, expire_holds: true }],
  ['everything at once', ALL],
];
for (const [name, flags] of scenarios) {
  test(`chaos: ${name} -> every integrity check passes`, async () => {
    const r = await runChaos(app.ctx, { capacity: 15, users: 80, baseUrl: app.base, organizerId: organizer.id, ...flags });
    assert.deepEqual(failing(r.report), [], JSON.stringify(r.timeline));
    assert.equal(r.passed, true);
    assert.ok(r.end_state.active <= 15);
    // the throwaway event and users are gone afterwards
    const left = await app.pool.query(`SELECT (SELECT count(*) FROM events WHERE is_demo)::int AS e, (SELECT count(*) FROM users WHERE email LIKE 'chaos-%')::int AS u`);
    assert.deepEqual(left.rows[0], { e: 0, u: 0 });
  });
}

test('POST /demo/chaos: organizers only, input validated, one run at a time', async () => {
  assert.equal((await app.call('POST', '/demo/chaos', { token: student.token, body: { capacity: 5, users: 10 } })).status, 401);
  assert.equal((await app.call('POST', '/demo/chaos', { token: organizer.token, body: { capacity: 0, users: 10 } })).status, 422);
  const [a, b] = await Promise.all([
    app.call('POST', '/demo/chaos', { token: organizer.token, body: { capacity: 5, users: 40, retry_storm: true } }),
    app.call('POST', '/demo/chaos', { token: organizer.token, body: { capacity: 5, users: 40 } }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const done = a.status === 200 ? a : b;
  assert.equal(done.body.passed, true);
});

test('sabotage: with the broken booking code the same checker turns red (it is not rigged)', async () => {
  const r = await runChaos(app.ctx, { capacity: 5, users: 60, baseUrl: app.base, organizerId: organizer.id, sabotage: true });
  assert.equal(r.passed, false);
  const broken = failing(r.report).map((f) => f.split(':')[0]);
  assert.ok(broken.includes('NO_OVERSELL') || broken.includes('COUNTER_EXACT'), `expected an oversell/counter failure, got ${broken}`);
});

test('sabotage with every failure switched on still returns a verdict (the database guard refusing is reported, not a crash)', async () => {
  const r = await runChaos(app.ctx, { capacity: 10, users: 100, baseUrl: app.base, organizerId: organizer.id, ...ALL, sabotage: true });
  assert.equal(r.passed, false);
  assert.ok(r.timeline.length >= 3);
});

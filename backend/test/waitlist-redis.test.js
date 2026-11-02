import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createManyUsers, createEvent, hold, checkInvariant } from './helpers.js';

let app, organizer;
before(async () => { app = await startTestApp({ redis: true }); organizer = await createUser(app, { role: 'organizer' }); });
after(() => app.close());

test('with Redis on: promotion keeps Redis in agreement, newcomers still cannot jump the queue, exactly capacity hold seats', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 10 });
  const holders = await createManyUsers(app, 10, 'h');
  const res = await Promise.all(holders.map((u) => hold(app, ev.id, u)));
  assert.ok(res.every((r) => r.status === 201));
  const waiters = await createManyUsers(app, 15, 'w');
  for (const w of waiters) assert.equal((await app.call('POST', `/events/${ev.id}/waitlist`, { token: w.token })).status, 200);

  // All holders cancel at once: 10 seats are transferred to the first 10 waiters.
  const out = await Promise.all(res.map((r, i) => app.call('POST', `/bookings/${r.body.booking.id}/cancel`, { token: holders[i].token })));
  assert.ok(out.every((r) => r.status === 200));

  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.active, 10); assert.equal(inv.seats_left, 0); assert.ok(inv.ok);

  // Redis was rebuilt from Postgres after the promotions.
  const keys = { seats: `event:{${ev.id}}:seats`, holders: `event:{${ev.id}}:holders` };
  assert.equal(await app.redis.raw.get(keys.seats), '0');
  assert.equal(await app.redis.raw.scard(keys.holders), 10);

  const newcomer = await createUser(app);
  const r = await hold(app, ev.id, newcomer);
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'SOLD_OUT');
  // And a promoted waiter can still retry their own hold and get their booking back (200 replay is not needed: they hold it).
  const rec = await app.redis.reconcile();
  assert.equal(rec.corrected, 0, 'reconcile found nothing to fix after promotion');
});

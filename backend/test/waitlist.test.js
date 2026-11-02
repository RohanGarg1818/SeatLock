import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createManyUsers, createEvent, hold, checkInvariant } from './helpers.js';
import { sweepOnce } from '../src/sweeper.js';

let app, organizer;
before(async () => { app = await startTestApp(); organizer = await createUser(app, { role: 'organizer' }); });
after(() => app.close());

const join = (ev, u) => app.call('POST', `/events/${ev.id}/waitlist`, { token: u.token });
async function soldOutEvent(capacity, extra = {}) {
  const ev = await createEvent(app, organizer.id, { capacity, ...extra });
  const holders = await createManyUsers(app, capacity, 'holder');
  const res = await Promise.all(holders.map((u) => hold(app, ev.id, u)));
  assert.ok(res.every((r) => r.status === 201));
  return { ev, holders, bookings: res.map((r) => r.body.booking) };
}
const bookingOf = async (evId, user) =>
  (await app.pool.query(`SELECT id, status FROM bookings WHERE event_id = $1 AND user_id = $2 AND status IN ('HELD','CONFIRMED')`, [evId, user.id])).rows[0];

test('cannot join while seats are available', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 5 });
  const u = await createUser(app);
  const r = await join(ev, u);
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'SEATS_AVAILABLE');
});

test('join a sold-out event: positions are in order, joining twice keeps your place, leaving works', async () => {
  const { ev } = await soldOutEvent(2);
  const [a, b, c] = await Promise.all([createUser(app), createUser(app), createUser(app)]);
  assert.equal((await join(ev, a)).body.waitlist.position, 1);
  assert.equal((await join(ev, b)).body.waitlist.position, 2);
  assert.equal((await join(ev, c)).body.waitlist.position, 3);
  assert.equal((await join(ev, a)).body.waitlist.position, 1, 'idempotent');
  const left = await app.call('DELETE', `/events/${ev.id}/waitlist`, { token: b.token });
  assert.equal(left.status, 204);
  assert.equal((await app.call('DELETE', `/events/${ev.id}/waitlist`, { token: b.token })).status, 404);
  const mine = await app.call('GET', '/me/waitlist', { token: c.token });
  assert.equal(mine.body.waitlist[0].position, 2, 'c moved up when b left');
});

test('someone who already holds a seat cannot join; ineligible domains cannot join', async () => {
  const { ev, holders } = await soldOutEvent(1);
  assert.equal((await join(ev, holders[0])).body.error.code, 'ALREADY_REGISTERED');
  const ev2 = await createEvent(app, organizer.id, { capacity: 1, domains: ['ipu.ac.in'] });
  assert.equal((await hold(app, ev2.id, await createUser(app, { email: 'insider@ipu.ac.in' }))).status, 201);
  const outsider = await createUser(app, { email: 'x@gmail.com' });
  assert.equal((await join(ev2, outsider)).body.error.code, 'NOT_ELIGIBLE');
});

test('cancelling a booking hands the seat to the FIRST waiter, in the same transaction; invariant holds', async () => {
  const { ev, holders, bookings } = await soldOutEvent(3);
  const [w1, w2] = [await createUser(app), await createUser(app)];
  await join(ev, w1); await join(ev, w2);
  const cancel = await app.call('POST', `/bookings/${bookings[0].id}/cancel`, { token: holders[0].token });
  assert.equal(cancel.status, 200);
  const b1 = await bookingOf(ev.id, w1);
  assert.equal(b1.status, 'HELD', 'first in line now holds the seat');
  assert.equal(await bookingOf(ev.id, w2), undefined, 'second in line still waits');
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.seats_left, 0); assert.equal(inv.active, 3); assert.ok(inv.ok);
  // The promoted person can confirm like anyone else, and is no longer on the waitlist.
  const conf = await app.call('POST', `/bookings/${b1.id}/confirm`, { token: w1.token, body: { answers: {} } });
  assert.equal(conf.status, 200);
  const mine = await app.call('GET', '/me/waitlist', { token: w2.token });
  assert.equal(mine.body.waitlist[0].position, 1);
});

test('a newcomer cannot jump the queue when a seat frees up', async () => {
  const { ev, holders, bookings } = await soldOutEvent(1);
  const waiter = await createUser(app); const newcomer = await createUser(app);
  await join(ev, waiter);
  await app.call('POST', `/bookings/${bookings[0].id}/cancel`, { token: holders[0].token });
  const r = await hold(app, ev.id, newcomer);
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'SOLD_OUT');
  assert.equal((await bookingOf(ev.id, waiter)).status, 'HELD');
});

test('expired holds are swept and their seats go to the waitlist', async () => {
  const { ev, bookings } = await soldOutEvent(2);
  const [w1, w2, w3] = [await createUser(app), await createUser(app), await createUser(app)];
  for (const w of [w1, w2, w3]) await join(ev, w);
  await app.pool.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ANY($1)`, [bookings.map((b) => b.id)]);
  assert.equal(await sweepOnce(app.ctx), 2);
  assert.equal((await bookingOf(ev.id, w1)).status, 'HELD');
  assert.equal((await bookingOf(ev.id, w2)).status, 'HELD');
  assert.equal(await bookingOf(ev.id, w3), undefined);
  const inv = await checkInvariant(app.pool, ev.id); assert.ok(inv.ok); assert.equal(inv.active, 2);
});

test('raising capacity promotes waiters; promoted hold lasts WAITLIST_HOLD_MINUTES', async () => {
  const { ev } = await soldOutEvent(2);
  const ws = await Promise.all([createUser(app), createUser(app), createUser(app)]);
  for (const w of ws) await join(ev, w);
  const r = await app.call('PATCH', `/events/${ev.id}/capacity`, { token: organizer.token, body: { capacity: 4 } });
  assert.equal(r.status, 200); assert.equal(r.body.event.capacity, 4); assert.equal(r.body.event.seats_left, 0);
  assert.equal((await bookingOf(ev.id, ws[0])).status, 'HELD');
  assert.equal((await bookingOf(ev.id, ws[1])).status, 'HELD');
  assert.equal(await bookingOf(ev.id, ws[2]), undefined);
  const { rows } = await app.pool.query(
    `SELECT extract(epoch FROM (hold_expires_at - now())) AS secs FROM bookings WHERE event_id = $1 AND user_id = $2`, [ev.id, ws[0].id]);
  assert.ok(rows[0].secs > 14 * 60 && rows[0].secs <= 15 * 60, `hold was ${rows[0].secs}s`);
  assert.ok((await checkInvariant(app.pool, ev.id)).ok);
});

test('everyone cancels at once while 30 people wait: exactly capacity promoted, in order, invariant intact', async () => {
  const { ev, holders, bookings } = await soldOutEvent(20);
  const waiters = await createManyUsers(app, 30, 'waiter');
  for (const w of waiters) assert.equal((await join(ev, w)).status, 200);
  const res = await Promise.all(bookings.map((b, i) => app.call('POST', `/bookings/${b.id}/cancel`, { token: holders[i].token })));
  assert.ok(res.every((r) => r.status === 200), JSON.stringify(res.map((r) => r.status)));
  const held = await app.pool.query(
    `SELECT u.id FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.event_id = $1 AND b.status = 'HELD' ORDER BY b.id`, [ev.id]);
  const heldIds = new Set(held.rows.map((r) => r.id));
  assert.equal(heldIds.size, 20);
  // The 20 promoted are exactly the first 20 in line.
  assert.deepEqual([...heldIds].sort(), waiters.slice(0, 20).map((w) => w.id).sort());
  const left = await app.pool.query('SELECT count(*)::int AS n FROM waitlist WHERE event_id = $1', [ev.id]);
  assert.equal(left.rows[0].n, 10);
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.active, 20); assert.equal(inv.seats_left, 0); assert.ok(inv.ok);
});

test('cancelling the event clears its waitlist; public event page reports my place', async () => {
  const { ev } = await soldOutEvent(1, { slug: 'wl-public' });
  const w = await createUser(app);
  await join(ev, w);
  const page = await app.call('GET', '/public/events/wl-public', { token: w.token });
  assert.equal(page.body.my_waitlist.position, 1); assert.equal(page.body.event.waitlist_count, 1);
  const stats = await app.call('GET', `/events/${ev.id}/stats`, { token: organizer.token });
  assert.equal(stats.body.stats.waitlist, 1);
  await app.call('POST', `/events/${ev.id}/cancel`, { token: organizer.token, body: {} });
  const n = await app.pool.query('SELECT count(*)::int AS n FROM waitlist WHERE event_id = $1', [ev.id]);
  assert.equal(n.rows[0].n, 0);
});

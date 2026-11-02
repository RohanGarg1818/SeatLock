import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createEvent, hold } from './helpers.js';

let app, admin, organizer, student;
before(async () => {
  app = await startTestApp();
  admin = await createUser(app, { role: 'admin' }); organizer = await createUser(app, { role: 'organizer', name: 'Olga Org' }); student = await createUser(app);
});
after(() => app.close());

test('admin stats are SQL aggregates that match reality; demo events are excluded', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 2, title: 'Stats Fest' });
  await createEvent(app, organizer.id, { status: 'DRAFT' });
  const h = await hold(app, ev.id, student);
  await app.call('POST', `/bookings/${h.body.booking.id}/confirm`, { token: student.token, body: { answers: {} } });
  const other = await createUser(app); await hold(app, ev.id, other); // sold out now
  const waiter = await createUser(app);
  await app.call('POST', `/events/${ev.id}/waitlist`, { token: waiter.token });
  await app.pool.query(`INSERT INTO events (organizer_id, slug, title, venue, starts_at, ends_at, registration_opens_at, capacity, seats_left, status, is_demo)
     VALUES ($1, 'demo-x', 'Demo', 'v', now() + interval '1 day', now() + interval '2 day', now(), 5, 5, 'PUBLISHED', true)`, [organizer.id]);

  const r = await app.call('GET', '/admin/stats', { token: admin.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.stats, { users: 5, organizers: 1, admins: 1, events: 2, live_events: 1, draft_events: 1,
    registrations: 1, holds: 1, checked_in: 0, waitlisted: 1 });
});

test('admin events list shows every organizer, with organizer name, counts and keyset paging; others are refused', async () => {
  const r = await app.call('GET', '/admin/events?limit=1', { token: admin.token });
  assert.equal(r.status, 200); assert.equal(r.body.events.length, 1); assert.ok(r.body.next_cursor);
  const r2 = await app.call('GET', `/admin/events?limit=5&before=${r.body.next_cursor}`, { token: admin.token });
  assert.equal(r2.status, 200);
  const all = [...r.body.events, ...r2.body.events];
  const stats = all.find((e) => e.title === 'Stats Fest');
  assert.equal(stats.organizer_name, 'Olga Org'); assert.equal(stats.confirmed_count, 1); assert.equal(stats.waitlist_count, 1);
  assert.ok(all.every((e) => e.slug !== 'demo-x'));
  for (const path of ['/admin/stats', '/admin/events']) {
    assert.equal((await app.call('GET', path, { token: organizer.token })).status, 403);
    assert.equal((await app.call('GET', path)).status, 401);
  }
});

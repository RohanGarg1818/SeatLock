import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createEvent } from './helpers.js';

// The API validates input, but the DATABASE must refuse bad rows too (scripts, console sessions, future bugs).
let app;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); });

const rejects = (promise, constraint) => assert.rejects(promise, (e) => e.code === '23514' && e.constraint === constraint, `expected ${constraint}`);

test('users: emails must be lower-case and shaped like emails, names must be trimmed', async () => {
  const q = (name, email) => app.pool.query(`INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'x')`, [name, email]);
  await rejects(q('Ann', 'Ann@Example.com'), 'users_email_lowercase');
  await rejects(q('Ann', 'not-an-email'), 'users_email_shape');
  await rejects(q(' Ann ', 'ann@example.com'), 'users_name_trimmed');
  await q('Ann', 'ann@example.com'); // a clean row is accepted
});

test('events: slug format, https-only banner, question list shape', async () => {
  const org = await createUser(app, { role: 'organizer' });
  const ev = await createEvent(app, org.id, {});
  const upd = (col, val) => app.pool.query(`UPDATE events SET ${col} = $1 WHERE id = $2`, [val, ev.id]);
  await rejects(upd('slug', 'Bad Slug!'), 'events_slug_format');
  await rejects(upd('banner_url', 'http://insecure.example/x.png'), 'events_banner_https');
  await rejects(upd('registration_questions', '{}'), 'events_questions_array');
  await rejects(upd('allowed_email_domains', '{}'), 'events_domains_nonempty');
});

test('bookings: a check-in needs a confirmed registration and the volunteer who did it', async () => {
  const org = await createUser(app, { role: 'organizer' });
  const ev = await createEvent(app, org.id, {});
  const user = await createUser(app, {});
  const ins = (status, confirmedAt, checkedInAt, by) => app.pool.query(
    `INSERT INTO bookings (event_id, user_id, status, hold_expires_at, idempotency_key, confirmed_at, checked_in_at, checked_in_by)
     VALUES ($1, $2, $3, now() + interval '5 min', $4, $5, $6, $7)`, [ev.id, user.id, status, Math.random().toString(36), confirmedAt, checkedInAt, by]);
  await rejects(ins('CONFIRMED', null, null, null), 'bookings_confirmed_has_time');
  await rejects(ins('HELD', null, new Date(), user.id), 'bookings_checkin_needs_confirm');
  await rejects(ins('CONFIRMED', new Date(), new Date(), null), 'bookings_checkin_has_actor');
});

test('updated_at maintains itself on every update', async () => {
  const org = await createUser(app, { role: 'organizer' });
  const ev = await createEvent(app, org.id, {});
  const before = (await app.pool.query('SELECT updated_at FROM events WHERE id = $1', [ev.id])).rows[0].updated_at;
  await new Promise((r) => setTimeout(r, 15));
  await app.pool.query(`UPDATE events SET tagline = 'changed' WHERE id = $1`, [ev.id]); // note: no updated_at in the statement
  const after = (await app.pool.query('SELECT updated_at FROM events WHERE id = $1', [ev.id])).rows[0].updated_at;
  assert.ok(after > before);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createEvent, hold } from './helpers.js';

// Organizers have their own sign-up, login and session. These tests pin down that the two sessions never mix.
let app;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); });

const cookieOf = (r, name) => (r.headers.get('set-cookie') || '').split(/,(?=\s*\w+=)/).find((c) => c.trim().startsWith(name + '='));
const signup = (o = {}) => ({ name: 'Olga Organizer', email: `org-${Math.random().toString(36).slice(2)}@club.dev`, password: 'correct horse battery', organization: 'Robotics Club', ...o });

test('organizer signup creates an organizer account, sets ONLY the organizer cookie, and /organizer/auth/me works with it', async () => {
  const body = signup();
  const r = await app.call('POST', '/organizer/auth/register', { body });
  assert.equal(r.status, 201); assert.equal(r.body.user.role, 'organizer'); assert.equal(r.body.user.organization, 'Robotics Club');
  const raw = await fetch(app.base + '/organizer/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: body.email, password: body.password }) });
  const set = raw.headers.get('set-cookie');
  assert.match(set, /^seatlock_org_token=/); assert.doesNotMatch(set, /seatlock_token=/); assert.match(set, /HttpOnly/i);
  const me = await app.call('GET', '/organizer/auth/me', { token: r.body.token });
  assert.equal(me.status, 200); assert.equal(me.body.user.email, body.email);
});

test('organization name is required, weak passwords are refused, duplicate emails are 409', async () => {
  assert.equal((await app.call('POST', '/organizer/auth/register', { body: signup({ organization: '' }) })).status, 422);
  assert.equal((await app.call('POST', '/organizer/auth/register', { body: signup({ password: 'short' }) })).status, 422);
  const b = signup();
  assert.equal((await app.call('POST', '/organizer/auth/register', { body: b })).status, 201);
  assert.equal((await app.call('POST', '/organizer/auth/register', { body: b })).status, 409);
});

test('the two portals reject each other: an organizer cannot log in on the website, an attendee cannot log in on the portal', async () => {
  const org = signup();
  await app.call('POST', '/organizer/auth/register', { body: org });
  const onSite = await app.call('POST', '/auth/login', { body: { email: org.email, password: org.password } });
  assert.equal(onSite.status, 403); assert.equal(onSite.body.error.code, 'WRONG_PORTAL');

  const att = { name: 'Asha', email: 'asha-portal@test.dev', password: 'correct horse battery' };
  const joined = await app.call('POST', '/auth/register', { body: att });
  assert.equal(joined.status, 201); assert.equal(joined.body.user.role, 'participant');
  const onPortal = await app.call('POST', '/organizer/auth/login', { body: { email: att.email, password: att.password } });
  assert.equal(onPortal.status, 403); assert.equal(onPortal.body.error.code, 'WRONG_PORTAL');
  // wrong password stays a plain 401, so the portal check cannot be used to probe which emails exist
  assert.equal((await app.call('POST', '/organizer/auth/login', { body: { email: att.email, password: 'nope-nope-nope' } })).status, 401);
  assert.equal((await app.call('POST', '/auth/login', { body: { email: org.email, password: 'nope-nope-nope' } })).status, 401);
});

test('tokens are bound to their portal: an attendee token cannot manage events, an organizer token cannot book seats', async () => {
  const org = (await app.call('POST', '/organizer/auth/register', { body: signup() })).body;
  const att = (await app.call('POST', '/auth/register', { body: { name: 'Ravi', email: 'ravi-portal@test.dev', password: 'correct horse battery' } })).body;
  const ev = await createEvent(app, org.user.id, { capacity: 3 });
  assert.equal((await app.call('GET', '/events', { token: org.token })).status, 200);
  assert.equal((await app.call('GET', '/events', { token: att.token })).status, 401);
  assert.equal((await hold(app, ev.id, att)).status, 201);
  assert.equal((await hold(app, ev.id, org)).status, 401);
  assert.equal((await app.call('GET', '/me/bookings', { token: org.token })).status, 401);
  assert.equal((await app.call('GET', '/auth/me', { token: org.token })).status, 401);
  assert.equal((await app.call('GET', '/organizer/auth/me', { token: att.token })).status, 401);
});

test('an admin may log in on the portal (to help organizers) but a role change takes effect without a re-login', async () => {
  const admin = await createUser(app, { role: 'admin', email: 'admin-portal@test.dev' });
  await app.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [admin.id, (await import('bcryptjs')).default.hashSync('correct horse battery', 4)]);
  const r = await app.call('POST', '/organizer/auth/login', { body: { email: admin.email, password: 'correct horse battery' } });
  assert.equal(r.status, 200); assert.equal(r.body.user.role, 'admin');
  assert.equal((await app.call('GET', '/events', { token: r.body.token })).status, 200);
  await app.pool.query(`UPDATE users SET role = 'participant' WHERE id = $1`, [admin.id]);
  assert.equal((await app.call('GET', '/events', { token: r.body.token })).status, 403); // demoted: the old session stops working at once
});

test('gate scanning works from both portals (volunteer on the website, organizer in the portal) and logout clears the right cookie', async () => {
  const org = (await app.call('POST', '/organizer/auth/register', { body: signup() })).body;
  const vol = (await app.call('POST', '/auth/register', { body: { name: 'Vik', email: 'vik-portal@test.dev', password: 'correct horse battery' } })).body;
  for (const t of [org.token, vol.token]) {
    const r = await app.call('POST', '/checkin', { token: t, body: { token: 'not-a-real-ticket', preview: true } });
    assert.notEqual(r.status, 401, 'authenticated on either side');
  }
  const out = await fetch(app.base + '/organizer/auth/logout', { method: 'POST' });
  assert.match(out.headers.get('set-cookie'), /^seatlock_org_token=;/);
  const out2 = await fetch(app.base + '/auth/logout', { method: 'POST' });
  assert.match(out2.headers.get('set-cookie'), /^seatlock_token=;/);
});

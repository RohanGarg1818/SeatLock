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

test('an admin signed in on the WEBSITE can manage every organizer\'s events without an organizer login; nobody else can cross over', async () => {
  const owner = await createUser(app, { role: 'organizer' });
  const ev = await createEvent(app, owner.id, { title: 'Owned by someone else' });
  const admin = await createUser(app, { role: 'admin' });          // admin.token is a website (attendee-audience) token
  const { signToken } = await import('../src/middleware/auth.js');

  // read, edit details, change capacity: all with the website session
  assert.equal((await app.call('GET', `/events/${ev.id}`, { token: admin.token })).status, 200);
  const patch = await app.call('PATCH', `/events/${ev.id}`, { token: admin.token, body: { title: 'Renamed by the admin', venue: 'Main Hall' } });
  assert.equal(patch.status, 200); assert.equal(patch.body.event.title, 'Renamed by the admin');
  assert.equal((await app.call('GET', `/events/${ev.id}/registrations`, { token: admin.token })).status, 200);
  assert.equal((await app.call('GET', '/organizer/auth/me', { token: admin.token })).body.user.role, 'admin');
  assert.equal((await app.call('GET', '/events?all=true', { token: admin.token })).body.events.some((e) => e.id === ev.id), true);

  // an organizer or participant holding only a website token still gets nothing from the portal API
  const org2 = await createUser(app, { role: 'organizer' });
  const siteTokenOfOrganizer = signToken(app.config, org2, 'attendee');
  assert.equal((await app.call('GET', `/events/${ev.id}`, { token: siteTokenOfOrganizer })).status, 401);
  const p = await createUser(app, {});
  assert.equal((await app.call('GET', `/events/${ev.id}`, { token: p.token })).status, 401);
});

test('volunteer desk: only staff of THAT event see who registered; they can mark someone present by hand; account settings work', async () => {
  const owner = await createUser(app, { role: 'organizer' });
  const ev = await createEvent(app, owner.id, { title: 'Desk test' });
  const vol = await createUser(app, {}), other = await createUser(app, {}), guest = await createUser(app, {});
  await app.pool.query('INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2)', [ev.id, vol.id]);
  const h = await hold(app, ev.id, guest);
  const booking = h.body.booking;
  assert.equal((await app.call('POST', `/bookings/${booking.id}/confirm`, { token: guest.token, body: { answers: {} } })).status, 200);

  assert.equal((await app.call('GET', `/staff/events/${ev.id}/desk`, { token: vol.token })).body.stats.confirmed, 1);
  const list = await app.call('GET', `/staff/events/${ev.id}/registrations`, { token: vol.token });
  assert.equal(list.body.registrations.length, 1); assert.equal(list.body.registrations[0].email, guest.email);
  assert.equal((await app.call('GET', `/staff/events/${ev.id}/registrations`, { token: other.token })).status, 404); // not staff
  assert.equal((await app.call('PATCH', `/events/${ev.id}`, { token: vol.token, body: { title: 'x' } })).status, 401); // volunteers cannot edit

  const mark = await app.call('POST', `/staff/events/${ev.id}/registrations/${booking.id}/present`, { token: vol.token });
  assert.equal(mark.status, 200);
  assert.equal((await app.call('POST', `/staff/events/${ev.id}/registrations/${booking.id}/present`, { token: vol.token })).status, 409);
  assert.equal((await app.call('GET', `/staff/events/${ev.id}/desk`, { token: vol.token })).body.stats.checked_in, 1);

  // settings: rename, then change password (wrong current password is refused)
  assert.equal((await app.call('PATCH', '/auth/me', { token: guest.token, body: { name: 'New Name' } })).body.user.name, 'New Name');
  assert.equal((await app.call('POST', '/auth/password', { token: guest.token, body: { current_password: 'wrong', new_password: 'a brand new password' } })).status, 401);
});

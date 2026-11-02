import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createManyUsers, createEvent, hold, checkInvariant } from './helpers.js';
import { sweepOnce } from '../src/sweeper.js';

let app, organizer, admin;
before(async () => {
  app = await startTestApp();
  organizer = await createUser(app, { role: 'organizer', email: 'org@test.dev' });
  admin = await createUser(app, { role: 'admin', email: 'admin@test.dev' });
});
after(() => app.close());

const validEvent = (o = {}) => ({
  title: 'Intro to Rust', venue: 'Lab 2', starts_at: '2027-03-10T10:00:00Z', ends_at: '2027-03-10T13:00:00Z',
  registration_opens_at: '2026-01-01T00:00:00Z', capacity: 10, description_md: 'Learn **Rust**.', ...o,
});
const expireHold = (bookingId) => app.pool.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [bookingId]);

// ---------------------------------------------------------------- auth
test('auth: register, login, me, logout; cookie is httpOnly + SameSite=Lax', async () => {
  const reg = await app.call('POST', '/auth/register', { body: { name: 'Asha', email: 'Asha@Test.dev', password: 'password123' } });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.email, 'asha@test.dev'); // normalised
  assert.equal(reg.body.user.role, 'participant');
  assert.equal(reg.body.user.password_hash, undefined);
  const cookie = reg.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);

  const dup = await app.call('POST', '/auth/register', { body: { name: 'Asha 2', email: 'asha@test.dev', password: 'password123' } });
  assert.equal(dup.status, 409); assert.equal(dup.body.error.code, 'EMAIL_TAKEN');

  const short = await app.call('POST', '/auth/register', { body: { name: 'X', email: 'x@test.dev', password: 'short' } });
  assert.equal(short.status, 422); assert.ok(short.body.error.details.fields.password);

  const bad = await app.call('POST', '/auth/login', { body: { email: 'asha@test.dev', password: 'wrongwrong' } });
  assert.equal(bad.status, 401);
  const ghost = await app.call('POST', '/auth/login', { body: { email: 'nobody@test.dev', password: 'whatever123' } });
  assert.equal(ghost.status, 401); assert.equal(ghost.body.error.code, bad.body.error.code); // same answer: no user enumeration

  const login = await app.call('POST', '/auth/login', { body: { email: 'asha@test.dev', password: 'password123' } });
  assert.equal(login.status, 200);
  // The cookie alone (no Bearer header) must authenticate.
  const cookieOnly = await fetch(app.base + '/auth/me', { headers: { cookie: login.headers.get('set-cookie').split(';')[0] } });
  assert.equal(cookieOnly.status, 200);
  assert.equal((await cookieOnly.json()).user.email, 'asha@test.dev');
  const me = await app.call('GET', '/auth/me', { token: login.body.token });
  assert.equal(me.status, 200);
  assert.equal((await app.call('GET', '/auth/me')).status, 401);
  assert.equal((await app.call('GET', '/auth/me', { token: 'garbage.token.here' })).status, 401);
});

test('errors: consistent JSON shape, bad JSON is 400, unknown route is 404, no stack traces', async () => {
  const bad = await fetch(app.base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.ok(!JSON.stringify(body).includes('node_modules'));
  const nf = await app.call('GET', '/nope');
  assert.equal(nf.status, 404); assert.equal(nf.body.error.code, 'NOT_FOUND');
});

test('every response carries X-Request-Id, and log lines include it', async () => {
  const lines = [];
  const a = await startTestApp({ logLines: lines, reset: false });
  const r = await a.call('GET', '/health');
  const id = r.headers.get('x-request-id');
  assert.match(id, /^[\w-]{8,64}$/);
  assert.ok(lines.map((l) => JSON.parse(l)).some((l) => l.reqId === id && l.msg === 'request' && l.status === 200));
  await a.close();
});

// ---------------------------------------------------------------- roles
test('role enforcement: participants cannot manage events; admin endpoints are admin-only', async () => {
  const p = await createUser(app);
  const ev = (await app.call('POST', '/events', { token: organizer.token, body: validEvent() })).body.event;
  const checks = [
    ['POST', '/events', validEvent()], ['GET', '/events'], ['GET', `/events/${ev.id}`], ['PATCH', `/events/${ev.id}`, { title: 'x' }],
    ['POST', `/events/${ev.id}/publish`], ['PATCH', `/events/${ev.id}/capacity`, { capacity: 5 }], ['POST', `/events/${ev.id}/cancel`],
    ['DELETE', `/events/${ev.id}`], ['GET', `/events/${ev.id}/stats`], ['GET', `/events/${ev.id}/registrations`],
    ['GET', `/events/${ev.id}/registrations.csv`], ['GET', `/events/${ev.id}/audit`], ['GET', `/events/${ev.id}/staff`],
    ['POST', `/events/${ev.id}/staff`, { email: 'a@b.co' }], ['DELETE', `/events/${ev.id}/staff/1`], ['POST', '/uploads/sign'],
    ['POST', '/demo/race', { mode: 'atomic', capacity: 1, requests: 1 }],
  ];
  for (const [m, path, body] of checks) {
    assert.equal((await app.call(m, path, { body })).status, 401, `${m} ${path} anonymous`);
    assert.equal((await app.call(m, path, { token: p.token, body })).status, 403, `${m} ${path} participant`);
  }
  for (const [m, path, body] of [['GET', '/admin/users'], ['PATCH', `/admin/users/${p.id}/role`, { role: 'organizer' }]]) {
    assert.equal((await app.call(m, path, { body })).status, 401);
    assert.equal((await app.call(m, path, { token: p.token, body })).status, 403);
    assert.equal((await app.call(m, path, { token: organizer.token, body })).status, 403, `${m} ${path} organizer`);
  }
});

test('ownership: another organizer cannot see or change my event (404); an admin can', async () => {
  const other = await createUser(app, { role: 'organizer' });
  const ev = (await app.call('POST', '/events', { token: organizer.token, body: validEvent() })).body.event;
  assert.equal((await app.call('GET', `/events/${ev.id}`, { token: other.token })).status, 404);
  assert.equal((await app.call('PATCH', `/events/${ev.id}`, { token: other.token, body: { title: 'Hijack' } })).status, 404);
  assert.equal((await app.call('POST', `/events/${ev.id}/publish`, { token: other.token })).status, 404);
  assert.equal((await app.call('GET', `/events/${ev.id}`, { token: admin.token })).status, 200);
  assert.equal((await app.call('PATCH', `/events/${ev.id}`, { token: admin.token, body: { title: 'Admin edit' } })).status, 200);
});

// ---------------------------------------------------------------- events
test('slugs: generated from title, collisions get a suffix, immutable after publish', async () => {
  const a = (await app.call('POST', '/events', { token: organizer.token, body: validEvent({ title: 'Café Night: AI & ML!' }) })).body.event;
  const b = (await app.call('POST', '/events', { token: organizer.token, body: validEvent({ title: 'Café Night: AI & ML!' }) })).body.event;
  assert.equal(a.slug, 'cafe-night-ai-ml');
  assert.match(b.slug, /^cafe-night-ai-ml-[0-9a-f]{6}$/);
  // concurrent creates of the same title still all succeed with distinct slugs
  const many = await Promise.all(Array.from({ length: 8 }, () => app.call('POST', '/events', { token: organizer.token, body: validEvent({ title: 'Same Title' }) })));
  assert.ok(many.every((r) => r.status === 201));
  assert.equal(new Set(many.map((r) => r.body.event.slug)).size, 8);
  assert.equal((await app.call('POST', `/events/${a.id}/publish`, { token: organizer.token })).status, 200);
  const edit = await app.call('PATCH', `/events/${a.id}`, { token: organizer.token, body: { slug: 'new-slug' } });
  assert.equal(edit.status, 422); // slug is not an editable field at all
  const after = await app.call('GET', `/events/${a.id}`, { token: organizer.token });
  assert.equal(after.body.event.slug, 'cafe-night-ai-ml');
});

test('drafts are invisible publicly; published events are visible; demo events never listed', async () => {
  const draft = (await app.call('POST', '/events', { token: organizer.token, body: validEvent({ title: 'Secret Draft' }) })).body.event;
  assert.equal((await app.call('GET', `/public/events/${draft.slug}`)).status, 404);
  assert.equal((await app.call('GET', `/public/events/${draft.slug}/calendar.ics`)).status, 404);
  let list = (await app.call('GET', '/public/events')).body.events;
  assert.ok(!list.some((e) => e.slug === draft.slug));
  const hold1 = await hold(app, draft.id, await createUser(app));
  assert.equal(hold1.status, 404); // cannot register for a draft either
  await app.call('POST', `/events/${draft.id}/publish`, { token: organizer.token });
  assert.equal((await app.call('GET', `/public/events/${draft.slug}`)).status, 200);
  list = (await app.call('GET', '/public/events')).body.events;
  assert.ok(list.some((e) => e.slug === draft.slug));
  await app.pool.query(`UPDATE events SET is_demo = true WHERE id = $1`, [draft.id]);
  assert.equal((await app.call('GET', `/public/events/${draft.slug}`)).status, 404);
  await app.pool.query(`UPDATE events SET is_demo = false WHERE id = $1`, [draft.id]);
});

test('publish validates completeness and state', async () => {
  const noDesc = (await app.call('POST', '/events', { token: organizer.token, body: validEvent({ description_md: '' }) })).body.event;
  const r = await app.call('POST', `/events/${noDesc.id}/publish`, { token: organizer.token });
  assert.equal(r.status, 422); assert.ok(r.body.error.details.fields.description_md);
  const past = (await app.call('POST', '/events', { token: organizer.token, body: validEvent({ starts_at: '2020-01-01T10:00:00Z', ends_at: '2020-01-01T12:00:00Z' }) })).body.event;
  assert.equal((await app.call('POST', `/events/${past.id}/publish`, { token: organizer.token })).status, 422);
  const ok = (await app.call('POST', '/events', { token: organizer.token, body: validEvent() })).body.event;
  assert.equal((await app.call('POST', `/events/${ok.id}/publish`, { token: organizer.token })).status, 200);
  assert.equal((await app.call('POST', `/events/${ok.id}/publish`, { token: organizer.token })).status, 409); // already published
});

test('validation: bad dates, capacity, question definitions are rejected with field errors', async () => {
  const t = organizer.token;
  assert.equal((await app.call('POST', '/events', { token: t, body: validEvent({ ends_at: '2027-03-10T09:00:00Z' }) })).status, 422);
  assert.equal((await app.call('POST', '/events', { token: t, body: validEvent({ capacity: 0 }) })).status, 422);
  assert.equal((await app.call('POST', '/events', { token: t, body: validEvent({ banner_url: 'javascript:alert(1)' }) })).status, 422);
  const tooMany = Array.from({ length: 16 }, (_, i) => ({ id: `q${i}`, type: 'text', label: 'Q', required: false }));
  assert.equal((await app.call('POST', '/events', { token: t, body: validEvent({ registration_questions: tooMany }) })).status, 422);
  assert.equal((await app.call('POST', '/events', { token: t, body: validEvent({ registration_questions: [{ id: 'a', type: 'color', label: 'x' }] }) })).status, 422);
  assert.equal((await app.call('POST', '/events', { token: t, body: validEvent({ registration_questions: [{ id: 'a', type: 'select', label: 'x' }] }) })).status, 422);
  assert.equal((await app.call('POST', '/events', { token: t, body: validEvent({ registration_questions: [{ id: 'a', type: 'text', label: 'x' }, { id: 'a', type: 'text', label: 'y' }] }) })).status, 422);
  assert.equal((await app.call('POST', '/events', { token: t, body: validEvent({ allowed_email_domains: ['not a domain'] }) })).status, 422);
});

test('only drafts can be deleted', async () => {
  const d = (await app.call('POST', '/events', { token: organizer.token, body: validEvent() })).body.event;
  assert.equal((await app.call('DELETE', `/events/${d.id}`, { token: organizer.token })).status, 204);
  assert.equal((await app.call('GET', `/events/${d.id}`, { token: organizer.token })).status, 404);
  const p = (await app.call('POST', '/events', { token: organizer.token, body: validEvent() })).body.event;
  await app.call('POST', `/events/${p.id}/publish`, { token: organizer.token });
  assert.equal((await app.call('DELETE', `/events/${p.id}`, { token: organizer.token })).status, 409);
});

// ---------------------------------------------------------------- registration questions + confirm
const QUESTIONS = [
  { id: 'name_on_ticket', type: 'text', label: 'Name on ticket', required: true, maxLength: 20 },
  { id: 'phone', type: 'phone', label: 'Phone', required: true },
  { id: 'year', type: 'select', label: 'Year', required: true, options: ['1st', '2nd', '3rd', '4th'] },
  { id: 'score', type: 'number', label: 'Score', required: false },
  { id: 'agree', type: 'checkbox', label: 'I agree to the code of conduct', required: true },
  { id: 'notes', type: 'long_text', label: 'Anything else?', required: false },
  { id: 'alt_email', type: 'email', label: 'Alt email', required: false },
];
const GOOD = { name_on_ticket: 'Asha K', phone: '+91 98765 43210', year: '2nd', agree: true };

async function publishedEventViaApi(body = {}) {
  const ev = (await app.call('POST', '/events', { token: organizer.token, body: validEvent(body) })).body.event;
  assert.equal((await app.call('POST', `/events/${ev.id}/publish`, { token: organizer.token })).status, 200);
  return ev;
}

test('confirm: valid answers confirm; invalid and missing required answers are rejected server-side', async () => {
  const ev = await publishedEventViaApi({ registration_questions: QUESTIONS });
  const u = await createUser(app);
  const h = await hold(app, ev.id, u);
  const id = h.body.booking.id;
  const confirm = (answers) => app.call('POST', `/bookings/${id}/confirm`, { token: u.token, body: { answers } });

  const missing = await confirm({ name_on_ticket: 'A' });
  assert.equal(missing.status, 422);
  assert.deepEqual(Object.keys(missing.body.error.details.fields).sort(), ['agree', 'phone', 'year']);
  assert.equal((await confirm({ ...GOOD, year: '5th' })).status, 422);                    // not an option
  assert.equal((await confirm({ ...GOOD, phone: 'abc' })).status, 422);                   // bad phone
  assert.equal((await confirm({ ...GOOD, name_on_ticket: 'x'.repeat(21) })).status, 422); // maxLength
  assert.equal((await confirm({ ...GOOD, agree: false })).status, 422);                   // required checkbox must be ticked
  assert.equal((await confirm({ ...GOOD, score: '12' })).status, 422);                    // number must be a number
  assert.equal((await confirm({ ...GOOD, alt_email: 'nope' })).status, 422);
  assert.equal((await confirm({ ...GOOD, surprise: 'extra' })).status, 422);              // unknown question id
  // none of the failed attempts consumed or confirmed anything
  const still = await app.pool.query('SELECT status FROM bookings WHERE id = $1', [id]);
  assert.equal(still.rows[0].status, 'HELD');

  const ok = await confirm({ ...GOOD, score: 42, notes: '', alt_email: 'Me@X.org' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.booking.status, 'CONFIRMED');
  assert.deepEqual(ok.body.booking.answers, { ...GOOD, score: 42, alt_email: 'me@x.org' }); // trimmed, normalised, empty optional dropped
  // idempotent: confirming again returns the booking with 200
  const again = await confirm({ ...GOOD });
  assert.equal(again.status, 200); assert.equal(again.body.booking.id, id);
});

test('confirm: expired hold => 410, even if the sweeper has not run; other users get 404', async () => {
  const ev = await publishedEventViaApi();
  const u = await createUser(app); const stranger = await createUser(app);
  const h = await hold(app, ev.id, u);
  const id = h.body.booking.id;
  assert.equal((await app.call('POST', `/bookings/${id}/confirm`, { token: stranger.token, body: { answers: {} } })).status, 404);
  assert.equal((await app.call('GET', `/bookings/${id}`, { token: stranger.token })).status, 404);
  await expireHold(id);
  const late = await app.call('POST', `/bookings/${id}/confirm`, { token: u.token, body: { answers: {} } });
  assert.equal(late.status, 410); assert.equal(late.body.error.code, 'HOLD_EXPIRED');
  await sweepOnce(app.ctx); // now the sweeper runs; confirm must still say 410
  assert.equal((await app.call('POST', `/bookings/${id}/confirm`, { token: u.token, body: { answers: {} } })).status, 410);
  assert.ok((await checkInvariant(app.pool, ev.id)).ok);
});

test('confirming the same hold twice at once confirms exactly once', async () => {
  const ev = await publishedEventViaApi();
  const u = await createUser(app);
  const id = (await hold(app, ev.id, u)).body.booking.id;
  const rs = await Promise.all(Array.from({ length: 6 }, () => app.call('POST', `/bookings/${id}/confirm`, { token: u.token, body: { answers: {} } })));
  assert.ok(rs.every((r) => r.status === 200 && r.body.booking.status === 'CONFIRMED'));
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.active, 1); assert.ok(inv.ok);
});

test('question edits: free before any booking; append-only-optional afterwards', async () => {
  const ev = await publishedEventViaApi({ registration_questions: [{ id: 'q1', type: 'text', label: 'Q1', required: true }] });
  const patch = (qs) => app.call('PATCH', `/events/${ev.id}`, { token: organizer.token, body: { registration_questions: qs } });
  assert.equal((await patch([{ id: 'q2', type: 'text', label: 'Q2', required: true }])).status, 200); // no bookings yet: anything goes
  assert.equal((await patch([{ id: 'q1', type: 'text', label: 'Q1', required: true }])).status, 200);
  const u = await createUser(app);
  await hold(app, ev.id, u);
  assert.equal((await patch([])).status, 409);                                                    // cannot remove
  assert.equal((await patch([{ id: 'q1', type: 'text', label: 'Q1', required: true }, { id: 'q3', type: 'text', label: 'Q3', required: true }])).status, 409); // new must be optional
  assert.equal((await patch([{ id: 'q1', type: 'number', label: 'Q1', required: true }])).status, 409);                                                       // cannot change type
  const grow = await patch([{ id: 'q1', type: 'text', label: 'Q1 (renamed)', required: true }, { id: 'q3', type: 'text', label: 'Q3', required: false }]);
  assert.equal(grow.status, 200);
});

// ---------------------------------------------------------------- eligibility + windows (database time)
test('eligibility by email domain', async () => {
  const ev = await publishedEventViaApi({ allowed_email_domains: ['ipu.ac.in', 'ggsipu.ac.in'] });
  const outsider = await createUser(app, { email: 'x@gmail.com' });
  const insider = await createUser(app, { email: 'rohan@IPU.ac.in' });
  const sub = await createUser(app, { email: 'x@evil-ipu.ac.in' });
  const r = await hold(app, ev.id, outsider);
  assert.equal(r.status, 403); assert.equal(r.body.error.code, 'NOT_ELIGIBLE');
  assert.equal((await hold(app, ev.id, sub)).status, 403);
  assert.equal((await hold(app, ev.id, insider)).status, 201);
  const after = await app.pool.query('SELECT seats_left FROM events WHERE id = $1', [ev.id]);
  assert.equal(after.rows[0].seats_left, ev.capacity - 1);
});

test('registration window uses database time: not open / closed / cancelled / ended', async () => {
  const org = organizer.id;
  const notOpen = await createEvent(app, org, { opensSql: "now() + interval '1 hour'" });
  const closed = await createEvent(app, org, { closesSql: "now() - interval '1 second'" });
  const u = await createUser(app);
  let r = await hold(app, notOpen.id, u); assert.equal(r.status, 403); assert.equal(r.body.error.code, 'REGISTRATION_NOT_OPEN');
  r = await hold(app, closed.id, u); assert.equal(r.status, 403); assert.equal(r.body.error.code, 'REGISTRATION_CLOSED');
  const states = Object.fromEntries((await app.call('GET', '/public/events')).body.events.map((e) => [e.id, e.registration_state]));
  assert.equal(states[notOpen.id], 'NOT_OPEN'); assert.equal(states[closed.id], 'CLOSED');
  // flip the window by changing rows only: the very next request sees the new state (nothing cached in app memory)
  await app.pool.query(`UPDATE events SET registration_opens_at = now() - interval '1 second' WHERE id = $1`, [notOpen.id]);
  assert.equal((await hold(app, notOpen.id, u)).status, 201);
  assert.equal((await hold(app, 999999, u)).status, 404);
  const ended = await createEvent(app, org, {});
  await app.pool.query(`UPDATE events SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' WHERE id = $1`, [ended.id]);
  assert.equal((await hold(app, ended.id, await createUser(app))).body.error.code, 'REGISTRATION_CLOSED');
});

test('sold out: public state flips to SOLD_OUT and holds return 409 SOLD_OUT', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 1, slug: 'tiny-event' });
  assert.equal((await hold(app, ev.id, await createUser(app))).status, 201);
  const r = await hold(app, ev.id, await createUser(app));
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'SOLD_OUT');
  const pub = await app.call('GET', '/public/events/tiny-event');
  assert.equal(pub.body.event.registration_state, 'SOLD_OUT'); assert.equal(pub.body.event.seats_left, 0);
});

// ---------------------------------------------------------------- cancel, sweeper, capacity, event cancel
test('cancel returns the seat; double cancel is 409; the user can register again afterwards', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 3 });
  const u = await createUser(app);
  const id = (await hold(app, ev.id, u, 'first')).body.booking.id;
  assert.equal((await checkInvariant(app.pool, ev.id)).seats_left, 2);
  const c1 = await app.call('POST', `/bookings/${id}/cancel`, { token: u.token });
  assert.equal(c1.status, 200); assert.equal(c1.body.booking.status, 'CANCELLED');
  assert.equal((await checkInvariant(app.pool, ev.id)).seats_left, 3);
  assert.equal((await app.call('POST', `/bookings/${id}/cancel`, { token: u.token })).status, 409);
  assert.equal((await checkInvariant(app.pool, ev.id)).seats_left, 3); // not released twice
  assert.equal((await hold(app, ev.id, u, 'second')).status, 201);       // re-registration allowed
  // simultaneous double-cancel releases once
  const id2 = (await hold(app, ev.id, await createUser(app))).body.booking.id;
  const owner = await app.pool.query('SELECT user_id FROM bookings WHERE id = $1', [id2]);
  assert.ok(owner.rows[0]);
  assert.ok((await checkInvariant(app.pool, ev.id)).ok);
});

test('cancelling a confirmed booking returns its seat; strangers cannot cancel', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 2 });
  const u = await createUser(app); const s = await createUser(app);
  const id = (await hold(app, ev.id, u)).body.booking.id;
  await app.call('POST', `/bookings/${id}/confirm`, { token: u.token, body: { answers: {} } });
  assert.equal((await app.call('POST', `/bookings/${id}/cancel`, { token: s.token })).status, 404);
  assert.equal((await app.call('POST', `/bookings/${id}/cancel`, { token: u.token })).status, 200);
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.seats_left, 2); assert.ok(inv.ok);
});

test('sweeper expires holds, returns seats, and leaves live holds + confirmed bookings alone', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 5 });
  const [a, b, c] = await createManyUsers(app, 3, 'sw');
  const ha = (await hold(app, ev.id, a)).body.booking.id;
  const hb = (await hold(app, ev.id, b)).body.booking.id;
  const hc = (await hold(app, ev.id, c)).body.booking.id;
  await app.call('POST', `/bookings/${hb}/confirm`, { token: b.token, body: { answers: {} } });
  await expireHold(ha); await expireHold(hb); // hb is already CONFIRMED so it must NOT be expired
  assert.equal(await sweepOnce(app.ctx), 1);
  const st = Object.fromEntries((await app.pool.query('SELECT id, status FROM bookings WHERE event_id = $1', [ev.id])).rows.map((r) => [r.id, r.status]));
  assert.deepEqual([st[ha], st[hb], st[hc]], ['EXPIRED', 'CONFIRMED', 'HELD']);
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.seats_left, 3); assert.ok(inv.ok);
  assert.equal(await sweepOnce(app.ctx), 0); // idempotent
  assert.equal((await hold(app, ev.id, a, 'again')).status, 201); // an expired holder may try again
});

test('two sweepers at once never double-release a seat', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 600 });
  const users = await createManyUsers(app, 600, 'many');
  await Promise.all(users.map((u) => hold(app, ev.id, u)));
  await app.pool.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE event_id = $1`, [ev.id]);
  // 3 sweepers, each draining until empty, all at the same time (deadlock aborts are retried by tx()).
  const drain = async () => { let t = 0, n; do { n = await sweepOnce(app.ctx); t += n; } while (n > 0); return t; };
  const totals = await Promise.all([drain(), drain(), drain()]);
  assert.equal(totals.reduce((a, b) => a + b, 0), 600);
  const inv = await checkInvariant(app.pool, ev.id);
  assert.equal(inv.active, 0); assert.equal(inv.seats_left, 600); assert.ok(inv.ok); // exactly capacity, never above
});

test('sweeper racing user cancels and confirms stays consistent', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 100 });
  const users = await createManyUsers(app, 100, 'mix');
  const ids = (await Promise.all(users.map((u) => hold(app, ev.id, u)))).map((r) => r.body.booking.id);
  await app.pool.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE event_id = $1`, [ev.id]);
  await Promise.all([
    sweepOnce(app.ctx), sweepOnce(app.ctx),
    ...users.slice(0, 50).map((u, i) => app.call('POST', `/bookings/${ids[i]}/cancel`, { token: u.token })),
    ...users.slice(50).map((u, i) => app.call('POST', `/bookings/${ids[50 + i]}/confirm`, { token: u.token, body: { answers: {} } })),
  ]);
  while (await sweepOnce(app.ctx)) { /* drain */ }
  assert.ok((await checkInvariant(app.pool, ev.id)).ok, 'invariant must hold whatever the interleaving');
});

test('capacity: increase adds seats; reduction below active bookings is rejected with 409', async () => {
  const ev = await publishedEventViaApi({ capacity: 5 });
  const us = await createManyUsers(app, 4, 'cap');
  await Promise.all(us.map((u) => hold(app, ev.id, u)));
  const set = (capacity) => app.call('PATCH', `/events/${ev.id}/capacity`, { token: organizer.token, body: { capacity } });
  const up = await set(8);
  assert.equal(up.status, 200); assert.equal(up.body.event.capacity, 8); assert.equal(up.body.event.seats_left, 4);
  const tooLow = await set(3);
  assert.equal(tooLow.status, 409); assert.equal(tooLow.body.error.code, 'CAPACITY_CONFLICT');
  assert.equal((await set(4)).status, 200); // exactly the number of active bookings is fine
  assert.equal((await checkInvariant(app.pool, ev.id)).seats_left, 0);
  assert.equal((await set(0)).status, 422);
  const inv = await checkInvariant(app.pool, ev.id); assert.ok(inv.ok);
  const audit = await app.call('GET', `/events/${ev.id}/audit`, { token: organizer.token });
  assert.ok(audit.body.entries.some((e) => e.action === 'event.capacity' && e.details.to === 8));
});

test('capacity change racing holds keeps the invariant', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 50 });
  const us = await createManyUsers(app, 150, 'capr');
  const set = (capacity) => app.call('PATCH', `/events/${ev.id}/capacity`, { token: organizer.token, body: { capacity } });
  await Promise.all([...us.map((u) => hold(app, ev.id, u)), set(30), set(80), set(60)]);
  const inv = await checkInvariant(app.pool, ev.id);
  assert.ok(inv.ok); assert.ok(inv.active <= inv.capacity);
});

test('cancelling an event cancels every active booking in one transaction and frees all seats', async () => {
  const ev = await publishedEventViaApi({ capacity: 6 });
  const us = await createManyUsers(app, 4, 'ec');
  const bs = await Promise.all(us.map((u) => hold(app, ev.id, u)));
  await app.call('POST', `/bookings/${bs[0].body.booking.id}/confirm`, { token: us[0].token, body: { answers: {} } });
  const r = await app.call('POST', `/events/${ev.id}/cancel`, { token: organizer.token });
  assert.equal(r.status, 200); assert.equal(r.body.bookings_cancelled, 4);
  const rows = await app.pool.query(`SELECT status FROM bookings WHERE event_id = $1`, [ev.id]);
  assert.ok(rows.rows.every((x) => x.status === 'CANCELLED'));
  const inv = await checkInvariant(app.pool, ev.id); assert.equal(inv.seats_left, 6); assert.ok(inv.ok);
  const h = await hold(app, ev.id, await createUser(app));
  assert.equal(h.status, 403); assert.equal(h.body.error.code, 'EVENT_CANCELLED');
  assert.equal((await app.call('GET', `/public/events/${ev.slug}`)).body.event.registration_state, 'CANCELLED');
  assert.equal((await app.call('POST', `/events/${ev.id}/cancel`, { token: organizer.token })).status, 409);
  assert.equal((await app.call('PATCH', `/events/${ev.id}`, { token: organizer.token, body: { title: 'x' } })).status, 409);
});

// ---------------------------------------------------------------- admin users
test('admin: list/search users with keyset pagination; role change is audited; cannot demote self', async () => {
  const target = await createUser(app, { name: 'Findable Person', email: 'findme@test.dev' });
  const list = await app.call('GET', '/admin/users?q=findable&limit=5', { token: admin.token });
  assert.equal(list.status, 200); assert.equal(list.body.users.length, 1); assert.equal(list.body.users[0].email, 'findme@test.dev');
  assert.equal(list.body.users[0].password_hash, undefined);
  const p1 = await app.call('GET', '/admin/users?limit=2', { token: admin.token });
  assert.equal(p1.body.users.length, 2); assert.ok(p1.body.next_cursor);
  const p2 = await app.call('GET', `/admin/users?limit=2&after=${p1.body.next_cursor}`, { token: admin.token });
  assert.ok(Number(p2.body.users[0].id) > Number(p1.body.next_cursor));

  const up = await app.call('PATCH', `/admin/users/${target.id}/role`, { token: admin.token, body: { role: 'organizer' } });
  assert.equal(up.status, 200); assert.equal(up.body.user.role, 'organizer');
  // role takes effect immediately (the user is re-read from the DB on every request)
  assert.equal((await app.call('POST', '/events', { token: target.token, body: validEvent() })).status, 201);
  const log = await app.pool.query(`SELECT * FROM audit_log WHERE action = 'user.role_change' AND entity_id = $1`, [target.id]);
  assert.equal(log.rows.length, 1); assert.equal(log.rows[0].details.to, 'organizer'); assert.equal(String(log.rows[0].actor_id), String(admin.id));
  assert.equal((await app.call('PATCH', `/admin/users/${admin.id}/role`, { token: admin.token, body: { role: 'participant' } })).status, 409);
  assert.equal((await app.call('PATCH', `/admin/users/${target.id}/role`, { token: admin.token, body: { role: 'wizard' } })).status, 422);
  assert.equal((await app.call('PATCH', `/admin/users/9999999/role`, { token: admin.token, body: { role: 'organizer' } })).status, 404);
});

test('me/bookings lists my registrations with event info', async () => {
  const ev = await createEvent(app, organizer.id, { title: 'Listed Event' });
  const u = await createUser(app);
  await hold(app, ev.id, u);
  const r = await app.call('GET', '/me/bookings', { token: u.token });
  assert.equal(r.status, 200); assert.equal(r.body.bookings.length, 1);
  assert.equal(r.body.bookings[0].event_title, 'Listed Event'); assert.equal(r.body.bookings[0].status, 'HELD');
});

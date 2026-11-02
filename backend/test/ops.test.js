import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startTestApp, createUser, createManyUsers, createEvent, hold, checkInvariant } from './helpers.js';
import { makeTicket, verifyTicket } from '../src/tickets.js';

let app, organizer, volunteer, outsider;
before(async () => {
  app = await startTestApp();
  organizer = await createUser(app, { role: 'organizer', name: 'Olive Organizer' });
  volunteer = await createUser(app, { name: 'Vik Volunteer', email: 'vik@test.dev' });
  outsider = await createUser(app, { name: 'Otto Outsider' });
});
after(() => app.close());

async function confirmedBooking(ev, user, answers = {}) {
  const h = await hold(app, ev.id, user);
  assert.equal(h.status, 201);
  const c = await app.call('POST', `/bookings/${h.body.booking.id}/confirm`, { token: user.token, body: { answers } });
  assert.equal(c.status, 200);
  return c.body.booking;
}
const ticketFor = async (booking, user) => (await app.call('GET', `/bookings/${booking.id}/ticket`, { token: user.token })).body.token;
const scan = (who, token, extra = {}) => app.call('POST', '/checkin', { token: who.token, body: { token, ...extra } });

// A minimal RFC 4180 parser, so the CSV test checks real round-tripping instead of string matching.
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

test('happy path: hold -> confirm -> ticket -> check-in (by the organizer)', async () => {
  const ev = await createEvent(app, organizer.id, { title: 'Gate Test' });
  const u = await createUser(app, { name: 'Asha Attendee' });
  const b = await confirmedBooking(ev, u);
  const token = await ticketFor(b, u);
  assert.deepEqual(verifyTicket(app.config, token), { bookingId: b.id, eventId: ev.id });
  const r = await scan(organizer, token);
  assert.equal(r.status, 200); assert.equal(r.body.result, 'OK'); assert.equal(r.body.attendee, 'Asha Attendee'); assert.equal(r.body.event_title, 'Gate Test');
  const row = (await app.pool.query('SELECT checked_in_at, checked_in_by FROM bookings WHERE id = $1', [b.id])).rows[0];
  assert.ok(row.checked_in_at); assert.equal(String(row.checked_in_by), String(organizer.id));
  const again = await scan(organizer, token);
  assert.equal(again.status, 409); assert.equal(again.body.error.code, 'ALREADY_CHECKED_IN');
  assert.equal(again.body.error.details.checked_in_by.name, 'Olive Organizer'); assert.ok(again.body.error.details.checked_in_at);
});

test('tickets: only confirmed bookings get one; only the owner can fetch it', async () => {
  const ev = await createEvent(app, organizer.id);
  const u = await createUser(app);
  const h = await hold(app, ev.id, u);
  assert.equal((await app.call('GET', `/bookings/${h.body.booking.id}/ticket`, { token: u.token })).status, 409);
  await app.call('POST', `/bookings/${h.body.booking.id}/confirm`, { token: u.token, body: { answers: {} } });
  assert.equal((await app.call('GET', `/bookings/${h.body.booking.id}/ticket`, { token: outsider.token })).status, 404);
  assert.equal((await app.call('GET', `/bookings/${h.body.booking.id}/ticket`, { token: u.token })).status, 200);
});

test('forged, tampered, malformed and foreign-secret tickets are rejected before touching the database', async () => {
  const ev = await createEvent(app, organizer.id);
  const u = await createUser(app);
  const b = await confirmedBooking(ev, u);
  const good = await ticketFor(b, u);
  const [payload, sig] = good.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ bookingId: '999', eventId: ev.id })).toString('base64url');
  const flipped = sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA');
  const foreign = makeTicket({ ticketSecret: 'some-other-secret-entirely-different' }, b.id, ev.id);
  const candidates = [`${forgedPayload}.${sig}`, `${payload}.${flipped}`, foreign, 'garbage', '', `${payload}.`, `.${sig}`, `${good}.extra`, `${payload}.${sig.slice(0, 10)}`, 'a'.repeat(600)];
  for (const t of candidates) {
    const r = await scan(organizer, t);
    assert.ok([400, 422].includes(r.status), `token ${t.slice(0, 20)} gave ${r.status}`);
    // (the 600-char token is refused earlier, by input validation)
    if (t) assert.ok(['INVALID_TICKET', 'VALIDATION_FAILED'].includes(r.body.error.code));
  }
  assert.equal((await app.pool.query('SELECT checked_in_at FROM bookings WHERE id = $1', [b.id])).rows[0].checked_in_at, null);
  // unsigned plain id (what a naive design would accept) is useless
  assert.equal((await scan(organizer, b.id)).status, 400);
});

test('secret rotation: tickets signed with the previous secret still verify; a leaked old secret stops working once removed', async () => {
  const oldCfg = { ticketSecret: 'old-secret-old-secret-old-secret-0000' };
  const newCfg = { ticketSecret: 'new-secret-new-secret-new-secret-1111', ticketSecretPrevious: oldCfg.ticketSecret };
  const t = makeTicket(oldCfg, 5, 6);
  assert.deepEqual(verifyTicket(newCfg, t), { bookingId: '5', eventId: '6' });
  assert.equal(verifyTicket({ ticketSecret: newCfg.ticketSecret }, t), null);
});

test('the same ticket scanned from several devices at once checks in exactly once', async () => {
  const ev = await createEvent(app, organizer.id);
  await app.call('POST', `/events/${ev.id}/staff`, { token: organizer.token, body: { email: volunteer.email } });
  const u = await createUser(app);
  const b = await confirmedBooking(ev, u);
  const token = await ticketFor(b, u);
  const results = await Promise.all([...Array(4)].flatMap(() => [scan(volunteer, token), scan(organizer, token)]));
  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [200, 409, 409, 409, 409, 409, 409, 409]);
  assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ALREADY_CHECKED_IN'));
  const audits = await app.pool.query(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'checkin' AND entity_id = $1 AND details->>'booking_id' = $2`, [ev.id, b.id]);
  assert.equal(audits.rows[0].n, 1); // exactly one audit row, written in the same transaction as the check-in
});

test('cancelled and unconfirmed bookings cannot check in', async () => {
  const ev = await createEvent(app, organizer.id);
  const u = await createUser(app);
  const b = await confirmedBooking(ev, u);
  const token = await ticketFor(b, u);
  await app.call('POST', `/bookings/${b.id}/cancel`, { token: u.token });
  const r = await scan(organizer, token);
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'BOOKING_CANCELLED');
  // a validly signed token for a booking that is only HELD (cannot happen via the API, but the DB check must still hold)
  const u2 = await createUser(app);
  const held = (await hold(app, ev.id, u2)).body.booking;
  const r2 = await scan(organizer, makeTicket(app.config, held.id, ev.id));
  assert.equal(r2.status, 409); assert.equal(r2.body.error.code, 'NOT_CONFIRMED');
});

test('only staff of THIS event may check in; removing a volunteer revokes access; wrong-event tickets are flagged', async () => {
  const evA = await createEvent(app, organizer.id); const evB = await createEvent(app, organizer.id);
  const u = await createUser(app);
  const bA = await confirmedBooking(evA, u); const tokenA = await ticketFor(bA, u);
  assert.equal((await scan(outsider, tokenA)).status, 403);
  await app.call('POST', `/events/${evB.id}/staff`, { token: organizer.token, body: { email: volunteer.email } }); // volunteer of B only
  const r = await scan(volunteer, tokenA);
  assert.equal(r.status, 403); assert.equal(r.body.error.code, 'NOT_STAFF');
  assert.equal((await app.call('POST', '/checkin', { token: volunteer.token, body: { token: tokenA, event_id: evB.id } })).body.error.code, 'WRONG_EVENT');
  await app.call('POST', `/events/${evA.id}/staff`, { token: organizer.token, body: { email: volunteer.email } });
  const rem = await app.call('DELETE', `/events/${evA.id}/staff/${volunteer.id}`, { token: organizer.token });
  assert.equal(rem.status, 204);
  assert.equal((await scan(volunteer, tokenA)).status, 403);
  await app.call('POST', `/events/${evA.id}/staff`, { token: organizer.token, body: { email: volunteer.email } });
  assert.equal((await scan(volunteer, tokenA)).status, 200);
  // another organizer (not owner, not staff) cannot either
  const other = await createUser(app, { role: 'organizer' });
  const u2 = await createUser(app); const b2 = await confirmedBooking(evB, u2);
  assert.equal((await scan(other, await ticketFor(b2, u2))).status, 403);
});

test('staff management: add by email, idempotent re-add, unknown email, audited, visible via /me/staff-events', async () => {
  const ev = await createEvent(app, organizer.id, { title: 'Staffed Event' });
  const vol = await createUser(app, { email: 'newvol@test.dev' });
  const add = await app.call('POST', `/events/${ev.id}/staff`, { token: organizer.token, body: { email: 'NewVol@test.dev' } });
  assert.equal(add.status, 201); assert.equal(add.body.staff.user_id, vol.id);
  assert.equal((await app.call('POST', `/events/${ev.id}/staff`, { token: organizer.token, body: { email: 'newvol@test.dev' } })).status, 200);
  assert.equal((await app.call('POST', `/events/${ev.id}/staff`, { token: organizer.token, body: { email: 'ghost@test.dev' } })).status, 404);
  assert.equal((await app.call('GET', `/events/${ev.id}/staff`, { token: organizer.token })).body.staff.length, 1);
  const mine = await app.call('GET', '/me/staff-events', { token: vol.token });
  assert.deepEqual(mine.body.events.map((e) => e.title), ['Staffed Event']);
  assert.equal((await app.call('DELETE', `/events/${ev.id}/staff/${outsider.id}`, { token: organizer.token })).status, 404);
  await app.call('DELETE', `/events/${ev.id}/staff/${vol.id}`, { token: organizer.token });
  const audit = (await app.call('GET', `/events/${ev.id}/audit`, { token: organizer.token })).body.entries.map((e) => e.action);
  assert.deepEqual(audit, ['staff.remove', 'staff.add']); // newest first; the duplicate add wrote nothing
});

test('stats use SQL aggregates and match reality', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 10 });
  const us = await createManyUsers(app, 6, 'st');
  const bs = [];
  for (const u of us.slice(0, 4)) bs.push(await confirmedBooking(ev, u));
  await hold(app, ev.id, us[4]);                                                  // 1 held
  await app.call('POST', `/bookings/${bs[0].id}/cancel`, { token: us[0].token }); // 1 cancelled
  await scan(organizer, await ticketFor(bs[1], us[1]));                           // 1 checked in
  const s = (await app.call('GET', `/events/${ev.id}/stats`, { token: organizer.token })).body.stats;
  assert.deepEqual([s.held, s.confirmed, s.cancelled, s.expired, s.checked_in, s.capacity, s.seats_left], [1, 3, 1, 0, 1, 10, 6]);
});

test('registrations: keyset pagination visits every row exactly once, in order, with search and status filter', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 100 });
  const us = await createManyUsers(app, 25, 'pg');
  await Promise.all(us.map((u) => hold(app, ev.id, u)));
  const seen = []; let cursor = null; let pages = 0;
  do {
    const r = await app.call('GET', `/events/${ev.id}/registrations?limit=10${cursor ? `&after=${cursor}` : ''}`, { token: organizer.token });
    assert.equal(r.status, 200); pages++;
    seen.push(...r.body.registrations.map((x) => x.id)); cursor = r.body.next_cursor;
  } while (cursor);
  assert.equal(pages, 3); assert.equal(seen.length, 25); assert.equal(new Set(seen).size, 25);
  assert.deepEqual(seen, [...seen].sort((a, b) => Number(a) - Number(b)));
  const q = await app.call('GET', `/events/${ev.id}/registrations?q=${encodeURIComponent('Bulk 7')}`, { token: organizer.token });
  assert.ok(q.body.registrations.every((x) => /Bulk 7/.test(x.name)));
  const pct = await app.call('GET', `/events/${ev.id}/registrations?q=${encodeURIComponent('%')}`, { token: organizer.token });
  assert.equal(pct.body.registrations.length, 0); // "%" is searched literally, not as a wildcard
  assert.equal((await app.call('GET', `/events/${ev.id}/registrations?status=CONFIRMED`, { token: organizer.token })).body.registrations.length, 0);
  assert.equal((await app.call('GET', `/events/${ev.id}/registrations?status=BOGUS`, { token: organizer.token })).status, 400);
  assert.equal((await app.call('GET', `/events/${ev.id}/registrations?after=abc`, { token: organizer.token })).status, 400);
});

test('CSV export streams correct CSV with commas, quotes, newlines, unicode and neutralised formulas', async () => {
  const questions = [
    { id: 'bio', type: 'long_text', label: 'Short bio, "quoted"', required: false },
    { id: 'phone', type: 'phone', label: 'Phone', required: false },
    { id: 'agree', type: 'checkbox', label: 'Agree', required: false },
  ];
  const ev = await createEvent(app, organizer.id, { questions, slug: 'csv-event' });
  const tricky = 'Line one, with comma\nLine two with "quotes"\r\nand a CRLF; ünïcødé 日本';
  const rows = [
    { name: 'Plain Person', answers: { bio: 'simple', phone: '+91 98765 43210', agree: true } },
    { name: 'Comma, Name', answers: { bio: tricky, agree: false } },
    { name: '=HYPERLINK("http://evil","click")', answers: { bio: '=1+1' } },
  ];
  for (const [i, r] of rows.entries()) {
    const u = await createUser(app, { name: r.name, email: `csv${i}@test.dev` });
    await confirmedBooking(ev, u, r.answers);
  }
  const res = await app.call('GET', `/events/${ev.id}/registrations.csv`, { token: organizer.token, raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /csv-event-registrations\.csv/);
  const text = (await res.text()).replace(/^﻿/, '');
  const parsed = parseCsv(text);
  assert.deepEqual(parsed[0], ['booking_id', 'name', 'email', 'status', 'registered_at', 'checked_in_at', 'Short bio, "quoted"', 'Phone', 'Agree']);
  assert.equal(parsed.length, 4); assert.ok(parsed.every((r) => r.length === 9));
  assert.equal(parsed[1][1], 'Plain Person'); assert.equal(parsed[1][7], '+91 98765 43210'); assert.equal(parsed[1][8], 'true');
  assert.equal(parsed[2][1], 'Comma, Name'); assert.equal(parsed[2][6], tricky); // survives the round trip byte for byte
  assert.equal(parsed[3][1], `'=HYPERLINK("http://evil","click")`); assert.equal(parsed[3][6], "'=1+1"); // formulas neutralised
});

test('CSV export streams a large event without buffering it (3000 rows, flat memory use)', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 3000, slug: 'big-csv' });
  const us = await createManyUsers(app, 3000, 'big');
  await app.pool.query(
    `INSERT INTO bookings (event_id, user_id, status, hold_expires_at, idempotency_key, confirmed_at, answers)
     SELECT $1, u, 'CONFIRMED', now(), 'k' || u, now(), '{}' FROM unnest($2::bigint[]) u`, [ev.id, us.map((u) => u.id)]);
  await app.pool.query('UPDATE events SET seats_left = 0 WHERE id = $1', [ev.id]);
  const res = await app.call('GET', `/events/${ev.id}/registrations.csv`, { token: organizer.token, raw: true });
  let chunks = 0, bytes = 0, maxChunk = 0; const parts = [];
  for await (const chunk of res.body) { chunks++; bytes += chunk.length; maxChunk = Math.max(maxChunk, chunk.length); parts.push(Buffer.from(chunk)); }
  assert.ok(chunks > 1, 'response must arrive in several chunks, not one buffered blob');
  assert.ok(maxChunk < bytes / 2, `largest chunk ${maxChunk} should be a small part of ${bytes} bytes`);
  assert.equal(parseCsv(Buffer.concat(parts).toString().replace(/^\uFEFF/, '')).length, 3001); // header + 3000 rows
  // the pooled connection must have been released
  const after = await app.call('GET', '/health');
  assert.equal(after.status, 200);
  assert.equal(app.pool.waitingCount, 0);
});

test('CSV: client hang-up mid-stream releases the database connection', async () => {
  const ev = (await app.pool.query(`SELECT id FROM events WHERE slug = 'big-csv'`)).rows[0];
  const before = app.pool.totalCount - app.pool.idleCount;
  const ctl = new AbortController();
  const res = await fetch(`${app.base}/events/${ev.id}/registrations.csv`, { headers: { Authorization: `Bearer ${organizer.token}` }, signal: ctl.signal });
  const reader = res.body.getReader();
  await reader.read();
  ctl.abort();
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(app.pool.totalCount - app.pool.idleCount, before, 'no connection may stay checked out');
});

test('audit log: written with the action, newest first, paginated; rolled-back actions leave nothing', async () => {
  const ev = (await app.call('POST', '/events', { token: organizer.token, body: { title: 'Audit Me', venue: 'V', starts_at: '2027-05-01T10:00:00Z', ends_at: '2027-05-01T12:00:00Z', registration_opens_at: '2026-01-01T00:00:00Z', capacity: 5, description_md: 'd' } })).body.event;
  await app.call('PATCH', `/events/${ev.id}`, { token: organizer.token, body: { tagline: 'hello' } });
  await app.call('POST', `/events/${ev.id}/publish`, { token: organizer.token });
  const us = await createManyUsers(app, 3, 'au');
  await Promise.all(us.map((u) => hold(app, ev.id, u)));
  assert.equal((await app.call('PATCH', `/events/${ev.id}/capacity`, { token: organizer.token, body: { capacity: 2 } })).status, 409);
  const all = (await app.call('GET', `/events/${ev.id}/audit`, { token: organizer.token })).body;
  assert.deepEqual(all.entries.map((e) => e.action), ['event.publish', 'event.update', 'event.create']); // failed capacity change: no row
  assert.equal(all.entries[0].actor_name, 'Olive Organizer');
  assert.deepEqual(all.entries[1].details.fields, ['tagline']);
  const p1 = (await app.call('GET', `/events/${ev.id}/audit?limit=2`, { token: organizer.token })).body;
  assert.equal(p1.entries.length, 2); assert.ok(p1.next_cursor);
  const p2 = (await app.call('GET', `/events/${ev.id}/audit?limit=2&before=${p1.next_cursor}`, { token: organizer.token })).body;
  assert.deepEqual(p2.entries.map((e) => e.action), ['event.create']); assert.equal(p2.next_cursor, null);
});

test('.ics calendar file: valid structure, escaped text, folded lines, cancelled status', async () => {
  const long = 'A very long event title, with commas; semicolons and a newline\nthat definitely exceeds the seventy-five octet limit for lines';
  const ev = await createEvent(app, organizer.id, { title: long, slug: 'ics-event' });
  await app.pool.query(`UPDATE events SET venue = 'Hall 1, Block B; Delhi' WHERE id = $1`, [ev.id]);
  const r = await app.call('GET', '/public/events/ics-event/calendar.ics');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/calendar/);
  assert.ok(r.text.startsWith('BEGIN:VCALENDAR\r\n')); assert.ok(r.text.trimEnd().endsWith('END:VCALENDAR'));
  assert.ok(r.text.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
  const unfolded = r.text.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:A very long event title\\, with commas\; semicolons and a newline\\nthat'));
  assert.ok(unfolded.includes('LOCATION:Hall 1\\, Block B\; Delhi'));
  assert.match(unfolded, /DTSTART:\d{8}T\d{6}Z/); assert.ok(unfolded.includes('STATUS:CONFIRMED'));
  await app.pool.query(`UPDATE events SET status = 'CANCELLED' WHERE id = $1`, [ev.id]);
  assert.ok((await app.call('GET', '/public/events/ics-event/calendar.ics')).text.includes('STATUS:CANCELLED'));
});

test('Cloudinary signing: hidden (404) when unconfigured; correct SHA-1 signature when configured', async () => {
  assert.equal((await app.call('POST', '/uploads/sign', { token: organizer.token })).status, 404);
  assert.equal((await app.call('GET', '/config')).body.cloudinary_enabled, false);
  const a = await startTestApp({ reset: false, env: { CLOUDINARY_CLOUD_NAME: 'democloud', CLOUDINARY_API_KEY: '12345', CLOUDINARY_API_SECRET: 'sekret' } });
  const r = await a.call('POST', '/uploads/sign', { token: organizer.token });
  assert.equal(r.status, 200);
  const expected = createHash('sha1').update(`folder=${r.body.folder}&timestamp=${r.body.timestamp}sekret`).digest('hex');
  assert.equal(r.body.signature, expected); assert.equal(r.body.cloud_name, undefined);
  assert.ok(!JSON.stringify(r.body).includes('sekret')); assert.match(r.body.upload_url, /democloud/);
  assert.equal((await a.call('GET', '/config')).body.cloudinary_enabled, true);
  await a.close();
});

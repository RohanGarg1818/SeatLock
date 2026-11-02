import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, createEvent, hold } from './helpers.js';

let app, organizer, volunteer;
before(async () => { app = await startTestApp(); organizer = await createUser(app, { role: 'organizer' }); volunteer = await createUser(app); });
after(() => app.close());

async function confirmed(ev, user, answers) {
  const h = await hold(app, ev.id, user);
  await app.call('POST', `/bookings/${h.body.booking.id}/confirm`, { token: user.token, body: { answers } });
  const t = await app.call('GET', `/bookings/${h.body.booking.id}/ticket`, { token: user.token });
  return { id: h.body.booking.id, token: t.body.token };
}

test('scanning shows who the person is and what they answered; preview changes nothing; a real scan then works once', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 5, title: 'Gate Fest', questions: [
    { id: 'roll', type: 'text', label: 'Roll number', required: true },
    { id: 'meal', type: 'select', label: 'Meal', required: true, options: ['Veg', 'Non-veg'] },
    { id: 'coc', type: 'checkbox', label: 'Agrees to code of conduct', required: true },
  ] });
  await app.pool.query('INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2)', [ev.id, volunteer.id]);
  const guest = await createUser(app, { name: 'Gita Rao', email: 'gita@college.edu' });
  const t = await confirmed(ev, guest, { roll: '0123', meal: 'Veg', coc: true });

  const peek = await app.call('POST', '/checkin', { token: volunteer.token, body: { token: t.token, event_id: ev.id, preview: true } });
  assert.equal(peek.status, 200);
  assert.equal(peek.body.result, 'VALID');
  assert.equal(peek.body.attendee, 'Gita Rao'); assert.equal(peek.body.email, 'gita@college.edu'); assert.equal(peek.body.event_title, 'Gate Fest');
  assert.deepEqual(peek.body.details, [
    { label: 'Roll number', value: '0123' }, { label: 'Meal', value: 'Veg' }, { label: 'Agrees to code of conduct', value: 'Yes' }]);
  assert.ok(peek.body.registered_at); assert.equal(peek.body.checked_in_at, null);

  // Previewing twice still does not use up the check-in.
  assert.equal((await app.call('POST', '/checkin', { token: volunteer.token, body: { token: t.token, preview: true } })).status, 200);
  const row = await app.pool.query('SELECT checked_in_at FROM bookings WHERE id = $1', [t.id]);
  assert.equal(row.rows[0].checked_in_at, null);

  const real = await app.call('POST', '/checkin', { token: volunteer.token, body: { token: t.token, event_id: ev.id } });
  assert.equal(real.status, 200); assert.equal(real.body.result, 'OK');
  assert.equal(real.body.details.length, 3); assert.ok(real.body.checked_in_at);

  // After check-in, both preview and a second scan say so.
  const again = await app.call('POST', '/checkin', { token: volunteer.token, body: { token: t.token, preview: true } });
  assert.equal(again.status, 409); assert.equal(again.body.error.code, 'ALREADY_CHECKED_IN');
  assert.equal((await app.call('POST', '/checkin', { token: volunteer.token, body: { token: t.token } })).status, 409);
});

test('preview obeys the same permissions: a non-staff user cannot peek at attendee data', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 2 });
  const guest = await createUser(app); const stranger = await createUser(app);
  const t = await confirmed(ev, guest, {});
  const r = await app.call('POST', '/checkin', { token: stranger.token, body: { token: t.token, preview: true } });
  assert.equal(r.status, 403); assert.equal(r.body.error.code, 'NOT_STAFF');
  const forged = await app.call('POST', '/checkin', { token: organizer.token, body: { token: t.token.slice(0, -2) + 'xx', preview: true } });
  assert.equal(forged.status, 400);
});

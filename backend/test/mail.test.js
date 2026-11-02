import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestApp, createUser, createEvent, hold } from './helpers.js';

let app, organizer, sink, received = [], failNext = false;
const wait = async (cond, ms = 2000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 25)); } };

before(async () => {
  // A fake email provider on a local port: records what the API sends.
  sink = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      received.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      res.statusCode = failNext ? 500 : 200; failNext = false; res.end('{}');
    });
  });
  await new Promise((r) => sink.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${sink.address().port}/emails`;
  app = await startTestApp({ env: { RESEND_API_KEY: 're_test_key', MAIL_FROM: 'SeatLock <t@example.com>', MAIL_API_URL: url, WEB_URL: 'https://site.test' } });
  organizer = await createUser(app, { role: 'organizer' });
});
after(async () => { await app.close(); sink.close(); });

test('confirming a booking emails the ticket link; a provider outage does not break the confirmation', async () => {
  const ev = await createEvent(app, organizer.id, { capacity: 5, title: 'Mail Fest' });
  const u = await createUser(app, { name: 'Mia', email: 'mia@test.dev' });
  const h = await hold(app, ev.id, u);
  const c = await app.call('POST', `/bookings/${h.body.booking.id}/confirm`, { token: u.token, body: { answers: {} } });
  assert.equal(c.status, 200);
  await wait(() => received.length === 1);
  assert.equal(received[0].auth, 'Bearer re_test_key');
  assert.deepEqual(received[0].body.to, ['mia@test.dev']);
  assert.match(received[0].body.subject, /Mail Fest/);
  assert.match(received[0].body.text, new RegExp(`https://site.test/me/tickets/${h.body.booking.id}`));

  failNext = true; // provider answers 500
  const u2 = await createUser(app);
  const h2 = await hold(app, ev.id, u2);
  const c2 = await app.call('POST', `/bookings/${h2.body.booking.id}/confirm`, { token: u2.token, body: { answers: {} } });
  assert.equal(c2.status, 200, 'registration succeeds even though the email failed');
  await wait(() => received.length === 2); // the (refused) attempt still reached the provider
});

test('a waitlist promotion emails the person who got the seat', async () => {
  received = [];
  const ev = await createEvent(app, organizer.id, { capacity: 1, title: 'Tiny Event', slug: 'tiny-event' });
  const holder = await createUser(app); const waiter = await createUser(app, { name: 'Wes', email: 'wes@test.dev' });
  const h = await hold(app, ev.id, holder);
  await app.call('POST', `/events/${ev.id}/waitlist`, { token: waiter.token });
  await app.call('POST', `/bookings/${h.body.booking.id}/cancel`, { token: holder.token });
  await wait(() => received.length === 1);
  assert.deepEqual(received[0].body.to, ['wes@test.dev']);
  assert.match(received[0].body.subject, /seat opened up/i);
  assert.match(received[0].body.text, /https:\/\/site\.test\/e\/tiny-event/);
});

test('with no email configured nothing is sent and nothing breaks', async () => {
  const bare = await startTestApp({ reset: false });
  try { assert.equal(bare.ctx.mailer.enabled, false); assert.equal(await bare.ctx.mailer.send({ to: 'a@b.c', subject: 's', text: 't' }), false); }
  finally { await bare.close(); }
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, createUser, portalToken } from './helpers.js';

// Poster uploads without Cloudinary: the image bytes live in Postgres and the event's banner_url points at /api/uploads/<id>.
let app;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); });

// A valid 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const upload = (token, body, type = 'image/png') => fetch(app.base + '/uploads/local', { method: 'POST', headers: { 'content-type': type, ...(token && { authorization: `Bearer ${token}` }) }, body });
const eventBody = (banner_url) => ({
  title: 'Poster event', tagline: '', description_md: '', venue: 'Hall', mode: 'offline',
  starts_at: new Date(Date.now() + 2 * 864e5).toISOString(), ends_at: new Date(Date.now() + 3 * 864e5).toISOString(),
  registration_opens_at: new Date(Date.now() - 36e5).toISOString(), capacity: 10, banner_url,
});

test('an organizer can upload a poster, it is served back, and an event can use it as its banner', async () => {
  const org = await createUser(app, { role: 'organizer' });
  const token = portalToken(app, org);
  const up = await upload(token, PNG);
  assert.equal(up.status, 201);
  const { url } = await up.json();
  assert.match(url, /^\/api\/uploads\/[0-9a-f-]{36}$/);

  const img = await fetch(app.base + url.replace('/api', ''));
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('cache-control'), /immutable/);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);

  const ev = await app.call('POST', '/events', { token, body: eventBody(url) });
  assert.equal(ev.status, 201); assert.equal(ev.body.event.banner_url, url);
  const patched = await app.call('PATCH', `/events/${ev.body.event.id}`, { token, body: { banner_url: null } });
  assert.equal(patched.status, 200); assert.equal(patched.body.event.banner_url, null);
});

test('uploads need an organizer, and only real JPG/PNG/WebP/GIF files are stored', async () => {
  assert.equal((await upload(null, PNG)).status, 401);
  const attendee = await createUser(app);
  assert.equal((await upload(attendee.token, PNG)).status, 401); // a participant has no organizer session
  const org = await createUser(app, { role: 'organizer' });
  const token = portalToken(app, org);
  assert.equal((await upload(token, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml')).status, 400);
  assert.equal((await upload(token, Buffer.from('this is not a picture at all'), 'image/png')).status, 400);
  assert.equal((await upload(token, Buffer.alloc(0))).status, 400);
});

test('unknown or malformed image ids are 404, and banner_url still refuses javascript: and other schemes', async () => {
  assert.equal((await fetch(app.base + '/uploads/not-a-uuid')).status, 404);
  assert.equal((await fetch(app.base + '/uploads/00000000-0000-0000-0000-000000000000')).status, 404);
  const org = await createUser(app, { role: 'organizer' });
  const token = portalToken(app, org);
  for (const bad of ['javascript:alert(1)', 'http://example.com/a.png', '/api/uploads/../../etc/passwd', '/other/path.png']) {
    assert.equal((await app.call('POST', '/events', { token, body: eventBody(bad) })).status, 422, bad);
  }
});

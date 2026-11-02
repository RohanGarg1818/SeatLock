// Public (shareable) event data. Only PUBLISHED / CANCELLED / COMPLETED non-demo events are visible;
// drafts never appear here, so a draft's slug is not discoverable even if guessed.
import { Router } from 'express';
import { AppError } from '../errors.js';
import { REG_STATE_SQL } from '../util.js';

const LIST_COLS = `e.id, e.slug, e.title, e.tagline, e.venue, e.mode, e.starts_at, e.ends_at, e.registration_opens_at,
  e.registration_closes_at, e.capacity, e.seats_left, e.banner_url, e.status,
  (SELECT u.organization FROM users u WHERE u.id = e.organizer_id) AS host`; // the society or club that runs it

// iCalendar rules: escape \ ; , and newlines in text; lines are folded at 75 octets with CRLF + space.
const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = [];
  let rest = Buffer.from(line);
  while (rest.length > 75) {
    let cut = 75;
    while ((rest[cut] & 0xc0) === 0x80) cut--; // do not split a multi-byte UTF-8 character
    out.push(rest.subarray(0, cut).toString());
    rest = Buffer.concat([Buffer.from(' '), rest.subarray(cut)]);
  }
  out.push(rest.toString());
  return out.join('\r\n');
}
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]|\.\d{3}/g, '');

export default function publicRouter(ctx, { optionalAuth }) {
  const r = Router();
  const { pool, config } = ctx;

  r.get('/public/events', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${LIST_COLS}, ${REG_STATE_SQL} AS registration_state
         FROM events e
        WHERE e.status = 'PUBLISHED' AND NOT e.is_demo AND e.ends_at > now()
        ORDER BY e.starts_at, e.id LIMIT 100`);
    res.json({ events: rows });
  });

  r.get('/public/events/:slug', optionalAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${LIST_COLS}, e.description_md, e.hold_minutes, e.allowed_email_domains, e.registration_questions,
              ${REG_STATE_SQL} AS registration_state, now() AS server_time
         FROM events e
        WHERE e.slug = $1 AND e.status IN ('PUBLISHED','CANCELLED','COMPLETED') AND NOT e.is_demo`,
      [req.params.slug]);
    if (!rows[0]) throw new AppError(404, 'EVENT_NOT_FOUND', 'Event not found.');
    const event = rows[0];

    // If the visitor is logged in, tell the page about their booking so it can show "You're registered".
    let my_booking = null;
    if (req.user) {
      const b = await pool.query(
        `SELECT id, status, hold_expires_at, GREATEST(0, floor(extract(epoch FROM (hold_expires_at - now()))))::int AS hold_seconds_left
           FROM bookings WHERE event_id = $1 AND user_id = $2 AND status IN ('HELD','CONFIRMED')`, [event.id, req.user.id]);
      my_booking = b.rows[0] || null;
    }
    // Waitlist info: how many are waiting, and where I am in line (if I joined).
    const wl = await pool.query('SELECT count(*)::int AS n FROM waitlist WHERE event_id = $1', [event.id]);
    event.waitlist_count = wl.rows[0].n;
    let my_waitlist = null;
    if (req.user) {
      const p = await pool.query(
        `SELECT (SELECT count(*)::int FROM waitlist x WHERE x.event_id = w.event_id AND x.id <= w.id) AS position
           FROM waitlist w WHERE w.event_id = $1 AND w.user_id = $2`, [event.id, req.user.id]);
      my_waitlist = p.rows[0] || null;
    }
    res.json({ event, my_booking, my_waitlist });
  });

  r.get('/public/events/:slug/calendar.ics', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, slug, title, tagline, venue, starts_at, ends_at, status FROM events
        WHERE slug = $1 AND status IN ('PUBLISHED','CANCELLED','COMPLETED') AND NOT is_demo`, [req.params.slug]);
    const e = rows[0];
    if (!e) throw new AppError(404, 'EVENT_NOT_FOUND', 'Event not found.');
    const url = config.webUrl ? `${config.webUrl}/e/${e.slug}` : null;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SeatLock//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:event-${e.id}@seatlock`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(e.starts_at)}`,
      `DTEND:${icsDate(e.ends_at)}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `LOCATION:${icsEscape(e.venue)}`,
      ...(e.tagline || url ? [`DESCRIPTION:${icsEscape([e.tagline, url].filter(Boolean).join('\n'))}`] : []),
      ...(url ? [`URL:${url}`] : []),
      `STATUS:${e.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT', 'END:VCALENDAR',
    ];
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${e.slug}.ics"`);
    res.send(lines.map(fold).join('\r\n') + '\r\n');
  });

  // Tells the website which optional features are switched on, so it can hide the rest.
  r.get('/config', (req, res) => {
    res.json({ cloudinary_enabled: Boolean(config.cloudinary), demo_enabled: config.enableDemo });
  });

  return r;
}

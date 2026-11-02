// npm run db:seed         -> creates (or promotes) the first admin from ADMIN_EMAIL. Safe for production.
// npm run db:seed:demo    -> also creates a believable campus programme: three societies, a few dozen students, six
//                            upcoming events in different states and one finished event with attendance recorded.
// Safe to run repeatedly: users and events are upserted, and an event that already has registrations is left alone.
//
// Registrations go through the SAME code the website uses (holdSeat, confirmBooking, joinWaitlist), so the seats_left
// counters, waitlist order and unique indexes in the demo data are produced by the real rules, never by hand.
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { migrate } from '../db/migrate.js';
import { holdSeat } from '../src/services/hold.js';
import { confirmBooking } from '../src/services/booking.js';
import { joinWaitlist } from '../src/services/waitlist.js';

const config = loadConfig();
const withDemo = process.argv.includes('--demo');
const pool = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(pool, () => {});


async function upsertUser(name, email, password, role) {
  const hash = await bcrypt.hash(password, config.bcryptCost);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role RETURNING id`, [name, email.toLowerCase(), hash, role]);
  return rows[0].id;
}

// ---------------------------------------------------------------------------------------------------------------
// Demo programme
// ---------------------------------------------------------------------------------------------------------------
const PASSWORD = 'password123';
const FIRST = ['Aarav', 'Ananya', 'Arjun', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Saanvi', 'Vihaan', 'Tanvi', 'Aditya', 'Neha', 'Karan', 'Pooja', 'Siddharth', 'Riya', 'Harsh', 'Simran', 'Yash', 'Mehak', 'Dev', 'Nisha', 'Kabir', 'Sneha', 'Manav', 'Ira', 'Rudra', 'Anika', 'Pranav', 'Tara'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kapoor', 'Malhotra', 'Bansal', 'Chopra', 'Arora', 'Khanna', 'Jain', 'Saxena', 'Mehta', 'Bhatia', 'Tandon'];

// Deterministic pseudo-random numbers, so every run of the seed produces the same programme.
function rng(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(2026);
const pick = (list) => list[Math.floor(rand() * list.length)];

const QUESTIONS = [
  { id: 'enrollment', type: 'text', label: 'Enrollment number', required: true, maxLength: 20 },
  { id: 'year', type: 'select', label: 'Year of study', required: true, options: ['1st', '2nd', '3rd', '4th'] },
  { id: 'phone', type: 'phone', label: 'WhatsApp number', required: true },
  { id: 'team', type: 'text', label: 'Team name (if you have one)', required: false },
  { id: 'code_of_conduct', type: 'checkbox', label: 'I agree to follow the code of conduct', required: true },
];
const UNIVERSITY = ['ipu.ac.in', 'ggsipu.ac.in'];

/** Bulk-insert users in one statement (one bcrypt hash shared by every demo account). Returns email -> {id, name, email}. */
async function insertUsers(rows, hash) {
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, organization)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::user_role[], $5::text[])
     ON CONFLICT (email) DO NOTHING`,
    [rows.map((r) => r.name), rows.map((r) => r.email), rows.map(() => hash), rows.map((r) => r.role ?? 'participant'), rows.map((r) => r.organization ?? null)]);
  const { rows: got } = await pool.query('SELECT id, name, email FROM users WHERE email = ANY($1)', [rows.map((r) => r.email)]);
  return new Map(got.map((u) => [u.email, u]));
}

// IST wall-clock time on a day counted from today, stored as the right instant.
const IST = (days, hour, minute = 0) => `((date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + make_interval(days => ${days}, hours => ${hour}, mins => ${minute})) AT TIME ZONE 'Asia/Kolkata')`;

async function insertEvent(e) {
  const { rows } = await pool.query(
    `INSERT INTO events (organizer_id, slug, title, tagline, description_md, venue, mode, starts_at, ends_at, registration_opens_at,
                         registration_closes_at, capacity, seats_left, hold_minutes, allowed_email_domains, registration_questions, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, ${IST(e.day, e.hour, e.minute ?? 0)}, ${IST(e.day, e.hour + e.hours, e.minute ?? 0)},
             ${e.opensSql ?? `now() - interval '${e.openedDaysAgo ?? 5} days'`}, ${e.closesSql ?? 'NULL'}, $8, $8, $9, $10, $11, $12)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [e.organizer.id, e.slug, e.title, e.tagline, e.description, e.venue, e.mode, e.capacity, e.holdMinutes ?? 5, e.domains ?? null,
     JSON.stringify(e.questions ?? []), e.status ?? 'PUBLISHED']);
  return rows[0]?.id ?? null; // null: the event already existed, so its data is left as it is
}

function answersFor(questions, n) {
  const a = {};
  for (const q of questions) {
    if (q.id === 'enrollment') a.enrollment = `0${String(11000000000 + n * 7919).slice(0, 10)}`.slice(0, 11);
    if (q.id === 'year') a.year = pick(q.options);
    if (q.id === 'phone') a.phone = `+91${9000000000 + Math.floor(rand() * 999999999)}`;
    if (q.id === 'team' && rand() < 0.6) a.team = pick(['Null Pointers', 'Stack Underflow', 'Git Happens', 'Cache Me Outside', 'Byte Me', 'Segfault Squad']);
    if (q.id === 'code_of_conduct') a.code_of_conduct = true;
  }
  return a;
}

/** Register `count` students for an event the way the website does: hold a seat, then confirm it. */
async function register(ctx, eventId, questions, students, count, offset = 0) {
  const done = [];
  for (let i = 0; i < count; i++) {
    const user = students[(offset + i) % students.length];
    const { booking } = await holdSeat(ctx, { eventId: String(eventId), user, key: `seed-${eventId}-${user.id}` });
    await confirmBooking(ctx, { bookingId: booking.id, user, answers: answersFor(questions, i) });
    done.push({ user, bookingId: booking.id });
  }
  return done;
}

async function seedDemo() {
  const hash = await bcrypt.hash(PASSWORD, config.bcryptCost);

  // Three societies, each with its own organizer account, plus a volunteer and the four original demo students.
  const people = await insertUsers([
    { name: 'Olive Organizer', email: 'organizer@seatlock.dev', role: 'organizer', organization: 'Coding Society, USICT' },
    { name: 'Rhea Kapoor', email: 'robotics@seatlock.dev', role: 'organizer', organization: 'Robotics Club' },
    { name: 'Dev Malhotra', email: 'culture@seatlock.dev', role: 'organizer', organization: 'Cultural Committee' },
    { name: 'Vik Volunteer', email: 'volunteer@seatlock.dev' },
    { name: 'Asha Sharma', email: 'asha@ipu.ac.in' },
    { name: 'Ravi Verma', email: 'ravi@ggsipu.ac.in' },
    { name: 'Meera Iyer', email: 'meera@gmail.com' }, // a gmail address: NOT eligible for university-only events
  ], hash);
  const [coding, robotics, culture, volunteer] = ['organizer@seatlock.dev', 'robotics@seatlock.dev', 'culture@seatlock.dev', 'volunteer@seatlock.dev'].map((e) => people.get(e));

  // A few dozen students who fill the events. (The named demo accounts above are left free for trying the flow by hand.)
  const roster = [];
  for (const f of FIRST) for (const l of LAST) { if (roster.length < 90 && rand() < 0.22) roster.push({ name: `${f} ${l}`, email: `${f}.${l}${roster.length + 1}@${rand() < 0.5 ? 'ipu.ac.in' : 'ggsipu.ac.in'}`.toLowerCase() }); }
  const students = [...(await insertUsers(roster, hash)).values()];

  const ctx = { pool, config, redis: null, mailer: null };
  const events = [
    { organizer: coding, slug: 'hackipu-2026', title: 'HackIPU 2026', tagline: '24 hours. One campus. Build something that works.', venue: 'Main Auditorium, USICT', mode: 'offline',
      day: 9, hour: 10, hours: 24, capacity: 40, questions: QUESTIONS, fill: 31, volunteers: true,
      description: `## About\n\nThe annual **24-hour hackathon** of the university.\n\n- Teams of 1-4\n- Mentors from industry\n- Prizes for the top three teams\n\n## Schedule\n\n1. 10:00 Registration & check-in\n2. 11:00 Kick-off\n3. Next day 11:00 Demos\n\n> Bring a laptop, a charger and an idea.` },
    { organizer: coding, slug: 'intro-to-rust', title: 'Intro to Rust: Ownership without Tears', tagline: 'A hands-on workshop for second-years.', venue: 'Lab 3, USICT', mode: 'hybrid',
      day: 4, hour: 15, hours: 3, capacity: 25, domains: UNIVERSITY, fill: 17, volunteers: true,
      description: `A relaxed, **hands-on** workshop. No prior Rust needed.\n\nOpen to students with a university email address only.` },
    { organizer: coding, slug: 'ml-study-jam', title: 'ML Study Jam: From Zero to Your First Model', tagline: 'A guided session on training and evaluating a model.', venue: 'Lab 1, USICT (and online)', mode: 'hybrid',
      day: 15, hour: 14, minute: 30, hours: 4, capacity: 12, domains: UNIVERSITY, fill: 12, waitlist: 4,
      description: `Bring a laptop. We start from the very basics and finish with a model you trained yourself.\n\nOpen to students with a university email address.\n\n**This one is full; join the waitlist and you will get a seat if someone drops out.**` },
    { organizer: coding, slug: 'design-sprint', title: 'Design Sprint: Ship a Prototype in a Day', tagline: 'From a blank page to a clickable prototype, together.', venue: 'Online (link sent after you register)', mode: 'online',
      day: 7, hour: 11, hours: 6, capacity: 60, fill: 22,
      description: `## What happens\n\nTeams pick a real campus problem in the morning and present a **clickable prototype** by evening.\n\n- Figma or paper, your choice\n- Short crits from seniors\n- Snacks included` },
    { organizer: culture, slug: 'open-mic-night', title: 'Open Mic Night', tagline: 'Music, poetry, stand-up. Five minutes each.', venue: 'Amphitheatre, North Campus', mode: 'offline',
      day: 11, hour: 18, minute: 30, hours: 3, capacity: 120, fill: 47,
      description: `Sign up to perform, or just come to cheer. **Doors open at 6:30 pm.**\n\nAll performances must be campus-friendly.` },
    { organizer: robotics, slug: 'robotics-demo-day', title: 'Robotics Demo Day', tagline: 'See what the club built this semester.', venue: 'Workshop Hall, Block C', mode: 'offline',
      day: 24, hour: 10, hours: 5, capacity: 80, opensSql: `now() + interval '72 hours'`,
      description: `Live demos from every robotics project, followed by a Q&A with the builders.\n\n**Registration opens in a few days.**` },
  ];

  for (const e of events) {
    const id = await insertEvent(e);
    if (!id) continue; // already seeded
    await register(ctx, id, e.questions ?? [], students, e.fill ?? 0);
    if (e.waitlist) for (let i = 0; i < e.waitlist; i++) await joinWaitlist(ctx, { eventId: String(id), user: students[(e.fill + i) % students.length] });
    if (e.volunteers) await pool.query('INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, volunteer.id]);
  }

  // A finished event, so the organizer dashboard has history. It ended in the past, so the website's own rules would
  // (rightly) refuse new registrations: its bookings are written directly, in ONE transaction, with seats_left
  // derived from them, and every attendee who showed up is checked in by the volunteer.
  const past = await insertPastEvent(coding, volunteer, students);
  console.log(`demo programme ready${past ? '' : ' (already present)'}. All demo accounts use the password: ${PASSWORD}`);
  console.log('  admin      ' + config.adminEmail + ' / ' + (config.adminPassword || '(your ADMIN_PASSWORD)'));
  console.log('  organizers organizer@seatlock.dev (Coding Society), robotics@seatlock.dev, culture@seatlock.dev');
  console.log('  volunteer  volunteer@seatlock.dev (scans at HackIPU and the Rust workshop)');
  console.log('  students   asha@ipu.ac.in, ravi@ggsipu.ac.in, meera@gmail.com (gmail is NOT eligible for university-only events)');
}

async function insertPastEvent(organizer, volunteer, students) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ev = await client.query(
      `INSERT INTO events (organizer_id, slug, title, tagline, description_md, venue, mode, starts_at, ends_at, registration_opens_at,
                           capacity, seats_left, status)
       VALUES ($1, 'git-github-bootcamp', 'Git & GitHub Bootcamp', 'Branches, pull requests and merge conflicts, survived.',
               'A beginner-friendly session on **version control**. Thanks to everyone who came!', 'Lab 2, USICT', 'offline',
               ${IST(-6, 14)}, ${IST(-6, 17)}, now() - interval '14 days', 40, 40, 'COMPLETED')
       ON CONFLICT (slug) DO NOTHING RETURNING id`, [organizer.id]);
    if (!ev.rows[0]) { await client.query('ROLLBACK'); return false; }
    const eventId = ev.rows[0].id;
    const going = students.slice(0, 33);
    const showed = going.filter((_, i) => i % 5 !== 4); // roughly one in five did not turn up
    await client.query(
      `INSERT INTO bookings (event_id, user_id, status, hold_expires_at, idempotency_key, confirmed_at, checked_in_at, checked_in_by, answers)
       SELECT $1, u.id, 'CONFIRMED', now() - interval '10 days', 'seed-past-' || u.id, now() - interval '9 days',
              CASE WHEN u.id = ANY($3::bigint[]) THEN ${IST(-6, 14, 5)} + (u.id % 20) * interval '1 minute' END,
              CASE WHEN u.id = ANY($3::bigint[]) THEN $4::bigint END, '{}'::jsonb
         FROM users u WHERE u.id = ANY($2::bigint[])`,
      [eventId, going.map((u) => u.id), showed.map((u) => u.id), volunteer.id]);
    await client.query(`UPDATE events SET seats_left = capacity - (SELECT count(*) FROM bookings WHERE event_id = $1 AND status = 'CONFIRMED') WHERE id = $1`, [eventId]);
    await client.query('COMMIT');
    return true;
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

// ---------------------------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------------------------
try {
  // ---- first admin ----
  if (!config.adminEmail) throw new Error('ADMIN_EMAIL is not set.');
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [config.adminEmail.toLowerCase()]);
  if (existing.rows[0]) {
    await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [existing.rows[0].id]);
    console.log(`promoted existing user ${config.adminEmail} to admin`);
  } else {
    if (!config.adminPassword) throw new Error('ADMIN_PASSWORD is required to create the first admin.');
    await upsertUser('Platform Admin', config.adminEmail, config.adminPassword, 'admin');
    console.log(`created admin ${config.adminEmail}`);
  }

  if (withDemo) await seedDemo();
} catch (err) {
  console.error('seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

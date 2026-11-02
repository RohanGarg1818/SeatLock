// npm run db:seed         -> creates (or promotes) the first admin from ADMIN_EMAIL. Safe for production.
// npm run db:seed:demo    -> also creates demo organizer / volunteer / participants and two published sample events.
// Safe to run repeatedly.
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { migrate } from '../db/migrate.js';

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

  if (withDemo) {
    const pw = 'password123';
    const organizer = await upsertUser('Olive Organizer', 'organizer@seatlock.dev', pw, 'organizer');
    const volunteer = await upsertUser('Vik Volunteer', 'volunteer@seatlock.dev', pw, 'participant');
    await upsertUser('Asha Sharma', 'asha@ipu.ac.in', pw, 'participant');
    await upsertUser('Ravi Verma', 'ravi@ggsipu.ac.in', pw, 'participant');
    await upsertUser('Meera Iyer', 'meera@gmail.com', pw, 'participant');

    const questions = JSON.stringify([
      { id: 'enrollment', type: 'text', label: 'Enrollment number', required: true, maxLength: 20 },
      { id: 'year', type: 'select', label: 'Year of study', required: true, options: ['1st', '2nd', '3rd', '4th'] },
      { id: 'phone', type: 'phone', label: 'WhatsApp number', required: true },
      { id: 'team', type: 'text', label: 'Team name (if you have one)', required: false },
      { id: 'code_of_conduct', type: 'checkbox', label: 'I agree to follow the code of conduct', required: true },
    ]);
    const insertEvent = (slug, title, tagline, desc, venue, mode, startDays, hours, capacity, domains, qs, opensInHours = -1) => pool.query(
      `INSERT INTO events (organizer_id, slug, title, tagline, description_md, venue, mode, starts_at, ends_at,
                           registration_opens_at, capacity, seats_left, hold_minutes, allowed_email_domains, registration_questions, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7, date_trunc('day', now()) + make_interval(days => $8, hours => 4, mins => 30), -- 10:00 IST
               date_trunc('day', now()) + make_interval(days => $8, hours => 4 + $9::int, mins => 30), now() + make_interval(hours => $13), $10, $10, 5, $11, $12, 'PUBLISHED')
       ON CONFLICT (slug) DO NOTHING`,
      [organizer, slug, title, tagline, desc, venue, mode, startDays, hours, capacity, domains, qs, opensInHours]);

    await insertEvent('hackipu-2026', 'HackIPU 2026', '24 hours. One campus. Build something that works.',
      `## About\n\nThe annual **24-hour hackathon** of the university.\n\n- Teams of 1-4\n- Mentors from industry\n- Prizes for the top three teams\n\n## Schedule\n\n1. 10:00 Registration & check-in\n2. 11:00 Kick-off\n3. Next day 11:00 Demos\n\n> Bring a laptop, a charger and an idea.`,
      'Main Auditorium, USICT', 'offline', 9, 24, 40, null, questions);
    await insertEvent('intro-to-rust', 'Intro to Rust: Ownership without Tears', 'A hands-on workshop for second-years.',
      `A relaxed, **hands-on** workshop. No prior Rust needed.\n\nOpen to students with a university email address only.`,
      'Lab 3, USICT', 'hybrid', 4, 3, 25, ['ipu.ac.in', 'ggsipu.ac.in'], '[]');

    // A few more so the home page looks like a real programme: different formats, sizes and registration states.
    await insertEvent('design-sprint', 'Design Sprint: Ship a Prototype in a Day', 'From a blank page to a clickable prototype, together.',
      `## What happens\n\nTeams pick a real campus problem in the morning and present a **clickable prototype** by evening.\n\n- Figma or paper, your choice\n- Short crits from seniors\n- Snacks included`,
      'Online (link sent after you register)', 'online', 7, 6, 60, null, '[]');
    await insertEvent('open-mic-night', 'Open Mic Night', 'Music, poetry, stand-up. Five minutes each.',
      `Sign up to perform, or just come to cheer. **Doors open at 10:00.**\n\nAll performances must be campus-friendly.`,
      'Amphitheatre, North Campus', 'offline', 11, 3, 120, null, '[]');
    await insertEvent('ml-study-jam', 'ML Study Jam: From Zero to Your First Model', 'A guided session on training and evaluating a model.',
      `Bring a laptop. We start from the very basics and finish with a model you trained yourself.\n\nOpen to students with a university email address.`,
      'Lab 1, USICT (and online)', 'hybrid', 15, 4, 30, ['ipu.ac.in', 'ggsipu.ac.in'], '[]');
    await insertEvent('robotics-demo-day', 'Robotics Demo Day', 'See what the club built this semester.',
      `Live demos from every robotics project, followed by a Q&A with the builders.\n\n**Registration opens in a few days.**`,
      'Workshop Hall, Block C', 'offline', 24, 5, 80, null, '[]', 72);

    const ev = await pool.query(`SELECT id FROM events WHERE slug IN ('hackipu-2026','intro-to-rust')`);
    for (const e of ev.rows) await pool.query(`INSERT INTO event_staff (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [e.id, volunteer]);
    console.log('demo data ready. All demo accounts use the password: password123');
    console.log('  admin      ' + config.adminEmail + ' / ' + (config.adminPassword || '(your ADMIN_PASSWORD)'));
    console.log('  organizer  organizer@seatlock.dev');
    console.log('  volunteer  volunteer@seatlock.dev (volunteer for HackIPU and the Rust workshop)');
    console.log('  students   asha@ipu.ac.in, ravi@ggsipu.ac.in, meera@gmail.com (gmail is NOT eligible for the Rust workshop)');
  }
} catch (err) {
  console.error('seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

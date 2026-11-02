// Load test for the hold endpoint, Postgres-only vs Redis-enabled.
//   npm run loadtest                      (defaults: 10 s per run, 64 connections)
//   LOADTEST_DURATION=20 LOADTEST_CONNECTIONS=128 npm run loadtest
//
// The API runs as a SEPARATE process (so the load generator and the server do not share one event loop).
// Everything (load generator, API, Postgres, Redis) still shares this machine's CPUs, so absolute numbers
// are only meaningful relative to each other. Nothing here is estimated: every figure comes from this run.
import { spawn } from 'node:child_process';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import autocannon from 'autocannon';
import pg from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '../src/config.js';
import { signToken } from '../src/middleware/auth.js';
import { migrate } from '../db/migrate.js';

const DURATION = Number(process.env.LOADTEST_DURATION || 10);
const CONNECTIONS = Number(process.env.LOADTEST_CONNECTIONS || 64);
const DB_URL = process.env.LOADTEST_DATABASE_URL || process.env.TEST_DATABASE_URL;
const REDIS_URL = (process.env.REDIS_URL || 'redis://localhost:6379').replace(/\/\d*$/, '') + '/2';
const PORT = 4100;
if (!DB_URL || !/test|load/i.test(new URL(DB_URL).pathname)) {
  console.error('Set TEST_DATABASE_URL (or LOADTEST_DATABASE_URL); its name must contain "test" or "load" because this script wipes it.');
  process.exit(1);
}

// Fresh random secrets so the child can honestly run with NODE_ENV=production (which rejects weak ones).
const JWT_SECRET = randomBytes(32).toString('hex');
const TICKET_SECRET = randomBytes(32).toString('hex');
const config = loadConfig({ ...process.env, DATABASE_URL: DB_URL, REDIS_URL: '', JWT_SECRET, TICKET_SECRET });
const pool = new pg.Pool({ connectionString: DB_URL, max: 5 });
await migrate(pool, () => {});

const SCENARIOS = [
  // Everyone rushes for 500 seats. After 500 successes almost every request is "sold out" - the situation Redis is built for.
  { name: 'rush (500 seats, 20k distinct users)', capacity: 500, users: 20000 },
  // Plenty of seats: nearly every request must write a booking. This measures the raw write path with one hot events row.
  { name: 'open (100k seats, 40k distinct users)', capacity: 100000, users: 40000 },
];
const MODES = [{ name: 'postgres-only', redis: false }, { name: 'redis-enabled', redis: true }];

async function setup(sc) {
  await pool.query('TRUNCATE audit_log, event_staff, bookings, events, users RESTART IDENTITY CASCADE');
  const org = (await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ('Load Org','org@load.dev','x','organizer') RETURNING id`)).rows[0];
  const ev = (await pool.query(
    `INSERT INTO events (organizer_id, slug, title, venue, starts_at, ends_at, registration_opens_at, capacity, seats_left, status)
     VALUES ($1,'load-event','Load','Hall', now()+interval '2 days', now()+interval '3 days', now()-interval '1 hour', $2, $2, 'PUBLISHED') RETURNING id`,
    [org.id, sc.capacity])).rows[0];
  const users = (await pool.query(
    `INSERT INTO users (name, email, password_hash) SELECT 'U'||g, 'u'||g||'@load.dev', 'x' FROM generate_series(1,$1) g RETURNING id`, [sc.users])).rows;
  return { eventId: ev.id, tokens: users.map((u) => signToken(config, u)) };
}

function startServer(redis) {
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB_URL, NODE_ENV: 'production', JWT_SECRET, TICKET_SECRET, LOG_LEVEL: 'error', ENABLE_DEMO: 'false',
      REDIS_URL: redis ? REDIS_URL : '', REDIS_ENABLED: redis ? 'true' : 'false', RATE_LIMIT_BOOKING_PER_MIN: '10000000', SWEEP_INTERVAL_SECONDS: '30' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return child;
}
async function waitHealthy() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/health`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('API did not become healthy');
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null);

async function run(sc, mode) {
  const { eventId, tokens } = await setup(sc);
  const redisClient = new Redis(REDIS_URL, { lazyConnect: true });
  await redisClient.connect(); await redisClient.flushdb();
  const server = startServer(mode.redis);
  try {
    await waitHealthy();
    if (mode.redis) {
      // startup sync builds the keys from Postgres; wait until it has
      for (let i = 0; i < 50 && !(await redisClient.exists(`event:{${eventId}}:seats`)); i++) await new Promise((r) => setTimeout(r, 100));
    }
    let counter = 0;
    const latencies = []; const codes = {};
    const instance = autocannon({
      url: `http://127.0.0.1:${PORT}`, connections: CONNECTIONS, duration: DURATION,
      requests: [{
        method: 'POST', path: `/events/${eventId}/hold`,
        setupRequest(req) {
          const i = counter++ % tokens.length;
          return { ...req, headers: { Authorization: `Bearer ${tokens[i]}`, 'Idempotency-Key': `lt-${counter}` } };
        },
      }],
    });
    instance.on('response', (_c, status, _b, ms) => { latencies.push(ms); codes[status] = (codes[status] || 0) + 1; });
    const result = await new Promise((res, rej) => { instance.on("done", res); instance.on("error", rej); });
    latencies.sort((a, b) => a - b);

    const inv = (await pool.query(
      `SELECT e.capacity, e.seats_left, (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status IN ('HELD','CONFIRMED')) AS active
         FROM events e WHERE e.id = $1`, [eventId])).rows[0];
    return {
      scenario: sc.name, mode: mode.name, duration_s: DURATION, connections: CONNECTIONS,
      total_requests: latencies.length, requests_per_sec: Math.round(result.requests.average * 10) / 10,
      latency_ms: { p50: pct(latencies, 50), p95: pct(latencies, 95), p99: pct(latencies, 99), max: latencies.at(-1) },
      response_codes: codes, non_2xx_autocannon: result.non2xx, errors: result.errors, timeouts: result.timeouts,
      bookings_active: inv.active, capacity: inv.capacity, seats_left: inv.seats_left,
      invariant_held: inv.active <= inv.capacity && inv.seats_left === inv.capacity - inv.active,
    };
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => server.once('exit', r));
    await redisClient.quit();
  }
}

const pgVersion = (await pool.query('SHOW server_version')).rows[0].server_version;
const rc = new Redis(REDIS_URL); const redisVersion = /redis_version:(\S+)/.exec(await rc.info('server'))?.[1]; await rc.quit();
const machine = {
  cpu: `${os.cpus()[0].model} x${os.cpus().length}`, memory_mb: Math.round(os.totalmem() / 1048576), os: `${os.type()} ${os.release()} ${os.arch()}`,
  node: process.version, postgres: pgVersion, redis: redisVersion, db_pool_max: config.dbPoolMax,
};
console.log('Machine:', machine);

const results = [];
for (const sc of SCENARIOS) {
  for (const mode of MODES) {
    process.stdout.write(`Running ${sc.name} / ${mode.name} for ${DURATION}s ... `);
    const r = await run(sc, mode);
    results.push(r);
    console.log(`${r.requests_per_sec} req/s, p99 ${r.latency_ms.p99} ms, invariant ${r.invariant_held ? 'held' : 'VIOLATED'}`);
  }
}
const out = { generated_at: new Date().toISOString(), machine, results };
await writeFile(new URL('../../docs/loadtest-results.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\n' + JSON.stringify(results, null, 2));
await pool.end();
if (results.some((r) => !r.invariant_held)) process.exit(2);

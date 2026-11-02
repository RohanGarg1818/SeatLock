// Run:  npm run race-demo -- [--capacity 20] [--requests 200]
// Starts the API in-process on a random port and races naive vs atomic booking against your database.
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { createLogger } from '../src/logger.js';
import { createApp } from '../src/app.js';
import { createRedisLayer } from '../src/redisLayer.js';
import { runRace } from '../src/services/raceDemo.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const capacity = arg('capacity', 20);
const requests = arg('requests', 200);

const config = { ...loadConfig(), enableDemo: true };
const log = createLogger({ level: 'error' });
const pool = createPool(config);
const redis = createRedisLayer({ config, pool, log });
const ctx = { config, pool, redis, log };
await redis?.waitReady();
const server = createApp(ctx).listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

console.log(`\nRacing ${requests} simultaneous requests for ${capacity} seats (redis: ${redis ? 'on' : 'off'})\n`);
for (const mode of ['naive', 'atomic']) {
  const r = await runRace(ctx, { mode, capacity, requests, baseUrl });
  console.log(`--- ${mode.toUpperCase()} ---`);
  console.log(`  requests fired      : ${r.requests_fired}`);
  console.log(`  response codes      : ${JSON.stringify(r.response_codes)}`);
  console.log(`  bookings created    : ${r.bookings_created}   (capacity ${r.capacity})`);
  console.log(`  final seats_left    : ${r.final_seats_left}`);
  console.log(`  oversold by         : ${r.oversold_by}`);
  console.log(`  invariant held      : ${r.invariant_held ? 'YES' : 'NO  <-- overselling'}`);
  console.log(`  counter consistent  : ${r.counter_consistent ? 'yes' : 'no  (lost updates)'}`);
  console.log(`  took                : ${r.elapsed_ms} ms\n`);
}
server.close();
await redis?.close();
await pool.end();

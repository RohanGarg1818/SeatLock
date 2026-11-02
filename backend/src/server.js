import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createLogger } from './logger.js';
import { createApp } from './app.js';
import { startSweeper } from './sweeper.js';
import { createRedisLayer } from './redisLayer.js';
import { createMailer } from './mailer.js';

const config = loadConfig();
const log = createLogger({ level: config.logLevel });
const pool = createPool(config);
const ctx = { config, pool, redis: null, log };
ctx.mailer = createMailer(ctx);
ctx.redis = createRedisLayer(ctx); // null when Redis is not configured

const app = createApp(ctx);
const stopSweeper = startSweeper(ctx);
let stopReconciler = () => {};
if (ctx.redis) {
  // Build the Redis keys from Postgres at startup (once connected), then keep them honest.
  ctx.redis.waitReady().then((ok) => ok && ctx.redis.syncAll()).catch((e) => log.error('initial redis sync failed', { err: e.message }));
  stopReconciler = ctx.redis.startReconciler();
}
const server = app.listen(config.port, () => log.info('api listening', { port: config.port, redis: Boolean(ctx.redis), demo: config.enableDemo }));

// Count requests still being handled so shutdown can let them finish before the DB pool is closed.
let inFlight = 0;
server.on('request', (req, res) => { inFlight++; res.on('close', () => inFlight--); });

async function shutdown(signal) {
  log.info('shutting down', { signal });
  stopSweeper();
  stopReconciler();
  server.close(async () => {
    for (let i = 0; i < 50 && inFlight > 0; i++) await new Promise((r) => setTimeout(r, 100));
    // Handlers whose client already hung up are not counted above but may still be finishing a query: short grace period.
    await new Promise((r) => setTimeout(r, 500));
    await ctx.redis?.close();
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref(); // do not hang forever on stuck connections
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

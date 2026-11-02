// Redis = an OPTIMISATION LAYER in front of Postgres. Never the source of truth.
//
// KEY PRINCIPLE (read this before anything else):
//   The Postgres conditional UPDATE (services/hold.js) still runs for EVERY request that Redis lets through.
//   So if Redis is wrong (stale counters, lost keys, crashed mid-way), the worst outcomes are:
//     - a false "sold out" answer (Redis counter too low)  -> a user can simply retry, reconcile repairs it
//     - extra database attempts (Redis counter too high)   -> Postgres says no, nobody is oversold
//   It can NEVER cause overselling, because seats_left > 0 plus the CHECK constraint live in Postgres.
//
// If REDIS_URL is unset or Redis is down, createRedisLayer returns null / every method degrades to
// "do nothing" and the Postgres-only path serves the request. Correct, just slower.
//
// Keys (the {id} braces are a Redis Cluster "hash tag" so all keys of one event live in the same slot,
// which Lua scripts touching several keys require):
//   event:{<id>}:seats     integer  seats still free, as far as Redis knows
//   event:{<id>}:holders   set      user ids that hold or have confirmed a seat
//   event:{<id>}:soldout   flag     "Postgres said zero seats" (short TTL, self-healing)
import Redis from 'ioredis';

// Atomic gate: three decisions in ONE indivisible step (Redis runs a Lua script without interleaving).
//  returns  1 = admitted (seat decremented, user recorded)   0 = sold out
//          -1 = user already holds a seat                   -2 = keys not initialised (do not trust Redis)
const GATE_LUA = `
local seats = redis.call('GET', KEYS[1])
if not seats then return -2 end
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -1 end
if tonumber(seats) <= 0 then return 0 end
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return 1`;

// Give seats back. Never creates the counter key (INCR on a missing key would invent "1 seat").
//  KEYS: seats, holders, soldout   ARGV[1]=seats to return  ARGV[2]='1' to remove holders  ARGV[3..]=user ids
const RELEASE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('INCRBY', KEYS[1], ARGV[1]) end
if ARGV[2] == '1' then for i = 3, #ARGV do redis.call('SREM', KEYS[2], ARGV[i]) end end
if tonumber(ARGV[1]) > 0 then redis.call('DEL', KEYS[3]) end
return 1`;

const k = (id) => ({ seats: `event:{${id}}:seats`, holders: `event:{${id}}:holders`, soldout: `event:{${id}}:soldout` });
const SOLDOUT_TTL_SECONDS = 30; // the flag heals itself even if a "seat returned" message was missed

export function createRedisLayer({ config, pool, log }) {
  if (!config.redisUrl) return null;

  const client = new Redis(config.redisUrl, {
    // Fail fast when Redis is down instead of queueing commands: a request must never wait on a dead cache.
    enableOfflineQueue: false,
    connectTimeout: 2000,
    commandTimeout: 300,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  client.defineCommand('gate', { numberOfKeys: 2, lua: GATE_LUA });
  client.defineCommand('release', { numberOfKeys: 3, lua: RELEASE_LUA });

  let healthy = false;
  let everReady = false;
  const lastWarn = new Map();
  const warnThrottled = (key, msg, fields) => {
    const now = Date.now();
    if (now - (lastWarn.get(key) || 0) < 10000) return;
    lastWarn.set(key, now);
    log.warn(msg, fields);
  };

  client.on('ready', () => {
    const wasDown = everReady && !healthy;
    healthy = true; everReady = true;
    log.info('redis connected');
    // After an outage keys may be missing or stale: rebuild them from Postgres.
    if (wasDown) layer.syncAll().catch((e) => log.error('redis resync failed', { err: e.message }));
  });
  const down = () => { if (healthy) log.warn('redis unavailable: falling back to the Postgres-only path'); healthy = false; };
  client.on('close', down);
  client.on('end', down);
  client.on('error', (err) => warnThrottled('conn', 'redis error (using Postgres-only fallback while it lasts)', { err: err.message }));

  // Run a Redis operation; on any failure return `fallback` so callers carry on with Postgres alone.
  async function safe(name, fn, fallback) {
    if (!healthy) {
      warnThrottled('down', 'redis unavailable: serving from Postgres only');
      return fallback;
    }
    try { return await fn(); } catch (err) {
      warnThrottled(name, `redis ${name} failed: falling back to Postgres`, { err: err.message });
      return fallback;
    }
  }

  const initInFlight = new Set();
  const negativeCache = new Map(); // eventId -> time of the last failed lazy init

  const layer = {
    isHealthy: () => healthy,

    // The pre-filter in front of the hold transaction. Returns:
    //   'ADMITTED' - Redis reserved a seat for this user (they MUST still pass the Postgres UPDATE)
    //   'SOLD_OUT' - reject now without touching Postgres
    //   'SKIP'     - Redis has no opinion (down, uninitialised, or user already holds a seat): go to Postgres
    async admit(eventId, userId) {
      const keys = k(eventId);
      return safe('admit', async () => {
        // Sold-out fast path: one GET and we are done for the thousands of requests that arrive after sell-out.
        if (await client.get(keys.soldout)) {
          // ...unless this user already holds a seat: their retry must reach Postgres to get their booking back.
          return (await client.sismember(keys.holders, String(userId))) ? 'SKIP' : 'SOLD_OUT';
        }
        const r = await client.gate(keys.seats, keys.holders, String(userId));
        if (r === 1) return 'ADMITTED';
        if (r === 0) return 'SOLD_OUT';
        if (r === -2) layer.lazyInit(eventId); // keys vanished (Redis restart/flush): rebuild in the background
        return 'SKIP';
      }, 'SKIP');
    },

    // Compensation: Redis admitted a request but Postgres did not hand out a NEW seat. Undo the Redis change.
    async compensate(eventId, userId, { keepHolder }) {
      const keys = k(eventId);
      return safe('compensate', () => client.release(keys.seats, keys.holders, keys.soldout, 1, keepHolder ? '0' : '1', String(userId)), null);
    },

    // After the Postgres commit of a cancel / expiry: the seats are back, so are the users' ability to re-register.
    async seatsReturned(eventId, userIds) {
      const keys = k(eventId);
      return safe('seatsReturned', () => client.release(keys.seats, keys.holders, keys.soldout, userIds.length, '1', ...userIds.map(String)), null);
    },
    seatsReturnedOne: (eventId, userId) => layer.seatsReturned(eventId, [userId]),

    // Called when PG itself reports zero seats. Short TTL so a missed clear can never wedge an event as sold out.
    async markSoldOut(eventId) {
      return safe('markSoldOut', () => client.set(k(eventId).soldout, '1', 'EX', SOLDOUT_TTL_SECONDS), null);
    },

    // Rebuild one event's keys from Postgres (publish, capacity change, startup, reconcile, lazy init).
    async syncEvent(eventId) {
      return safe('syncEvent', async () => {
        const keys = k(eventId);
        const ev = await pool.query(`SELECT seats_left, status FROM events WHERE id = $1`, [eventId]);
        if (!ev.rows[0] || ev.rows[0].status !== 'PUBLISHED') return client.del(keys.seats, keys.holders, keys.soldout);
        const holders = await pool.query(
          `SELECT user_id FROM bookings WHERE event_id = $1 AND status IN ('HELD','CONFIRMED')`, [eventId]);
        const multi = client.multi().del(keys.holders, keys.soldout).set(keys.seats, ev.rows[0].seats_left);
        const ids = holders.rows.map((r) => String(r.user_id));
        for (let i = 0; i < ids.length; i += 1000) multi.sadd(keys.holders, ...ids.slice(i, i + 1000));
        await multi.exec();
        return true;
      }, null);
    },
    initEvent: (eventId) => layer.syncEvent(eventId),

    // Read-only look at what Redis currently believes about one event (used by the integrity checker). null = unknown.
    async peek(eventId) {
      return safe('peek', async () => {
        const keys = k(eventId);
        const [seats, holders] = await Promise.all([client.get(keys.seats), client.scard(keys.holders)]);
        return seats === null ? null : { seats: Number(seats), holders };
      }, null);
    },

    lazyInit(eventId) {
      const now = Date.now();
      if (initInFlight.has(eventId) || now - (negativeCache.get(eventId) || 0) < 5000) return;
      initInFlight.add(eventId);
      layer.syncEvent(eventId)
        .then(async () => { if (!(await client.exists(k(eventId).seats))) negativeCache.set(eventId, Date.now()); })
        .catch(() => negativeCache.set(eventId, Date.now()))
        .finally(() => initInFlight.delete(eventId));
    },

    async dropEvent(eventId) {
      const keys = k(eventId);
      return safe('dropEvent', () => client.del(keys.seats, keys.holders, keys.soldout), null);
    },

    async syncAll() {
      const { rows } = await pool.query(`SELECT id FROM events WHERE status = 'PUBLISHED' AND ends_at > now() AND NOT is_demo`);
      for (const r of rows) await layer.syncEvent(r.id);
      log.info('redis keys rebuilt from postgres', { events: rows.length });
      return rows.length;
    },

    // Reconciliation: compare Redis with Postgres and fix drift (crash between admit and compensate, manual
    // edits, a lost "seat returned" message...). Every correction is logged.
    // `only` = check just that one event (the Chaos Lab uses this for its throwaway demo event, which the
    // normal pass skips because demo events are never cached in production).
    async reconcile(only = null) {
      if (!healthy) return { checked: 0, corrected: 0, skipped: true };
      const { rows } = only
        ? { rows: [{ id: only }] }
        : await pool.query(`SELECT id FROM events WHERE status = 'PUBLISHED' AND ends_at > now() AND NOT is_demo`);
      let corrected = 0;
      const snapshot = async (id) => {
        const keys = k(id);
        const pg = await pool.query(
          `SELECT e.seats_left, (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status IN ('HELD','CONFIRMED')) AS holders
             FROM events e WHERE e.id = $1`, [id]);
        const [seats, holders] = await Promise.all([client.get(keys.seats), client.scard(keys.holders)]);
        return { pg: pg.rows[0], redisSeats: seats === null ? null : Number(seats), redisHolders: holders };
      };
      const drifted = (s) => !s.pg || s.redisSeats !== s.pg.seats_left || s.redisHolders !== s.pg.holders;
      for (const { id } of rows) {
        try {
          let s = await snapshot(id);
          if (!drifted(s)) continue;
          // In-flight requests make Redis and Postgres differ for a few milliseconds. Look again before "fixing".
          await new Promise((r) => setTimeout(r, 250));
          s = await snapshot(id);
          if (!drifted(s)) continue;
          log.warn('redis drift corrected', { eventId: id, redisSeats: s.redisSeats, pgSeatsLeft: s.pg.seats_left, redisHolders: s.redisHolders, pgHolders: s.pg.holders });
          await layer.syncEvent(id);
          corrected++;
        } catch (err) {
          warnThrottled('reconcile', 'reconcile skipped an event', { eventId: id, err: err.message });
        }
      }
      return { checked: rows.length, corrected };
    },

    // Fixed-window counter for rate limiting. Returns the new count, or null if Redis is unavailable.
    async incrWindow(key, windowSec) {
      return safe('incrWindow', async () => {
        const res = await client.multi().incr(key).expire(key, windowSec + 1).exec();
        const [err, count] = res[0];
        if (err) throw err;
        return count;
      }, null);
    },

    async ping() {
      if (!healthy) return false;
      try { return (await client.ping()) === 'PONG'; } catch { return false; }
    },

    async waitReady(ms = 3000) {
      if (healthy) return true;
      return new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), ms);
        client.once('ready', () => { clearTimeout(t); resolve(true); });
      });
    },

    startReconciler() {
      const timer = setInterval(() => layer.reconcile().catch((e) => log.error('reconcile failed', { err: e.message })), config.reconcileIntervalSeconds * 1000);
      timer.unref();
      return () => clearInterval(timer);
    },

    // Test helpers
    flush: () => client.flushdb(),
    raw: client,
    async close() { try { await client.quit(); } catch { client.disconnect(); } },
    // Simulate an outage in tests: drop the connection without letting ioredis reconnect.
    killConnection() { client.disconnect(); },
  };
  return layer;
}

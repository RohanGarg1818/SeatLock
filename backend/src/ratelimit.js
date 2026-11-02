// Fixed-window rate limiter.
//
//   key = limiter name + caller id + the current window number
//   every request does INCR on that key; if the count is over the limit we answer 429.
//
// Trade-off (fixed vs sliding window): a caller can send `limit` requests at the very end of one
// window and `limit` more at the very start of the next, i.e. up to 2x the limit in a short burst
// across the boundary. A sliding window (sorted set of timestamps, or a weighted blend of the
// current and previous window) removes that, but costs more Redis work per request. For login
// throttling and booking spam, the cheap fixed window is good enough.
//
// Storage: Redis when healthy (shared by all API instances), otherwise an in-process Map. The Map
// is per-instance, so limits become looser behind several instances, but the API stays protected.
import { AppError } from './errors.js';

const memory = new Map(); // key -> { count, resetAt }

function memoryIncr(key, windowSec) {
  const now = Date.now();
  if (memory.size > 10000) for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
  let entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowSec * 1000 };
    memory.set(key, entry);
  }
  entry.count++;
  return entry.count;
}

export function rateLimit(ctx, { name, limit, windowSec = 60, by }) {
  return async (req, res, next) => {
    const id = by === 'ip' ? req.ip : req.user?.id ?? req.ip;
    const nowSec = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSec / windowSec);
    const key = `rl:${name}:${id}:${bucket}`;

    let count = ctx.redis ? await ctx.redis.incrWindow(key, windowSec) : null;
    if (count === null) count = memoryIncr(key, windowSec); // Redis off or unreachable

    if (count > limit) {
      const retryAfter = windowSec - (nowSec % windowSec);
      const err = new AppError(429, 'RATE_LIMITED', `Too many requests. Try again in ${retryAfter}s.`);
      err.headers = { 'Retry-After': String(retryAfter) };
      throw err;
    }
    next();
  };
}

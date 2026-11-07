import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

// AsyncLocalStorage carries the request id through every await, so ANY log line written while a
// request is being handled automatically includes it without passing `req` around.
const als = new AsyncLocalStorage();
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function createLogger({ level = 'info', write } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  const out = write || ((line) => process.stdout.write(line + '\n'));
  const emit = (lvl, msg, fields) => {
    if (LEVELS[lvl] < min) return;
    const reqId = als.getStore()?.reqId;
    out(JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...(reqId && { reqId }), ...fields }));
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}

export function requestLogger(log) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    // Only trust a client-supplied id if it looks harmless (prevents log injection).
    const reqId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.set('X-Request-Id', reqId);
    const start = process.hrtime.bigint();
    als.run({ reqId }, () => {
      res.on('finish', () => {
        log.info('request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Number(process.hrtime.bigint() - start) / 1e6,
          userId: req.user?.id,
          ip: req.ip, // check this in the Render logs: it must be the visitor's address, not Vercel's (see TRUST_PROXY in the README)
        });
      });
      next();
    });
  };
}

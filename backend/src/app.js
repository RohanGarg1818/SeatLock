import express from 'express';
import { errorHandler, notFoundHandler } from './errors.js';
import { requestLogger } from './logger.js';
import { authMiddleware } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import eventsRouter from './routes/events.js';
import publicRouter from './routes/public.js';
import bookingsRouter from './routes/bookings.js';
import eventOpsRouter from './routes/eventOps.js';
import checkinRouter from './routes/checkin.js';
import uploadsRouter from './routes/uploads.js';
import demoRouter from './routes/demo.js';

// ctx = { config, pool, redis (or null), log }. Passing it explicitly (instead of importing globals)
// is what lets tests build an app against a test database with Redis on or off.
export function createApp(ctx) {
  const { config } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(requestLogger(ctx.log));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  const auth = authMiddleware(ctx);

  app.get('/health', async (req, res) => {
    const out = { status: 'ok', postgres: 'ok', redis: ctx.redis ? 'ok' : 'disabled' };
    try { await ctx.pool.query('SELECT 1'); } catch { out.postgres = 'down'; out.status = 'degraded'; }
    if (ctx.redis && !(await ctx.redis.ping())) { out.redis = 'down'; }
    // Redis being down is NOT fatal (we fall back to Postgres), so only Postgres decides the status code.
    res.status(out.postgres === 'ok' ? 200 : 503).json(out);
  });

  app.use(authRouter(ctx, auth));
  app.use(adminRouter(ctx, auth));
  app.use(eventsRouter(ctx, auth));
  app.use(eventOpsRouter(ctx, auth));
  app.use(checkinRouter(ctx, auth));
  app.use(uploadsRouter(ctx, auth));
  app.use(publicRouter(ctx, auth));
  app.use(bookingsRouter(ctx, auth));
  if (config.enableDemo) app.use(demoRouter(ctx, auth));

  app.use(notFoundHandler);
  app.use(errorHandler(ctx));
  return app;
}

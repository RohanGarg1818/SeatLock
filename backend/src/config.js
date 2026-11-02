// All configuration comes from environment variables, read in exactly one place.
// loadConfig takes an env object so tests can build an app with custom settings.

const truthy = (v, fallback = false) =>
  v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const int = (v, fallback) => {
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Expected an integer but got "${v}"`);
  return n;
};

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const need = (name) => {
    const v = env[name];
    if (!v) throw new Error(`Missing required environment variable ${name}. See backend/.env.example.`);
    // Refuse the placeholder secrets from .env.example in production.
    if (isProd && (v.startsWith('change-me') || v.length < 32)) {
      throw new Error(`${name} is too weak for production (need >= 32 random characters).`);
    }
    return v;
  };

  const cloudinary =
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
      ? { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET }
      : null;

  // Optional transactional email through Resend's HTTP API. Without both values, emails are skipped (and logged at debug).
  const mail = env.RESEND_API_KEY && env.MAIL_FROM
    ? { apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, apiUrl: env.MAIL_API_URL || 'https://api.resend.com/emails' }
    : null;

  const enableDemo = truthy(env.ENABLE_DEMO);
  if (isProd && enableDemo) throw new Error('ENABLE_DEMO must not be true in production.');

  return {
    nodeEnv,
    isProd,
    port: int(env.PORT, 4000),
    databaseUrl: env.DATABASE_URL,
    dbPoolMax: int(env.DB_POOL_MAX, 20),
    jwtSecret: need('JWT_SECRET'),
    ticketSecret: need('TICKET_SECRET'),
    ticketSecretPrevious: env.TICKET_SECRET_PREVIOUS || null,
    bcryptCost: int(env.BCRYPT_COST, 10),
    trustProxy: int(env.TRUST_PROXY, 0),
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    rateLimit: {
      authPerMin: int(env.RATE_LIMIT_AUTH_PER_MIN, 20),
      bookingPerMin: int(env.RATE_LIMIT_BOOKING_PER_MIN, 30),
    },
    sweepIntervalSeconds: int(env.SWEEP_INTERVAL_SECONDS, 30),
    reconcileIntervalSeconds: int(env.RECONCILE_INTERVAL_SECONDS, 60),
    // Redis is optional: no URL (or REDIS_ENABLED=false) means Postgres-only mode.
    redisUrl: truthy(env.REDIS_ENABLED, true) && env.REDIS_URL ? env.REDIS_URL : null,
    enableDemo,
    cloudinary,
    mail,
    waitlistHoldMinutes: int(env.WAITLIST_HOLD_MINUTES, 15),
    webUrl: (env.WEB_URL || '').replace(/\/$/, '') || null,
    logLevel: env.LOG_LEVEL || 'info',
    adminEmail: env.ADMIN_EMAIL || null,
    adminPassword: env.ADMIN_PASSWORD || null,
  };
}

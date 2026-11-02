import jwt from 'jsonwebtoken';
import { AppError } from '../errors.js';

const COOKIE = 'seatlock_token';
const WEEK_MS = 7 * 24 * 3600 * 1000;

// Tiny cookie reader so we need no cookie-parser dependency.
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function signToken(config, user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '7d' });
}

export function setAuthCookie(config, res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true, // JavaScript on the page can never read the token, so XSS cannot steal it
    sameSite: 'lax', // not sent on cross-site POSTs, which is our main CSRF defence
    secure: config.isProd,
    maxAge: WEEK_MS,
    path: '/',
  });
}

export const clearAuthCookie = (config, res) =>
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' });

export function authMiddleware(ctx) {
  const { pool, config } = ctx;

  // Returns the user (loaded fresh from the DB so role changes apply immediately) or null.
  async function identify(req) {
    const header = req.get('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || readCookie(req, COOKIE);
    if (!token) return { user: null };
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return { user: null, invalid: true };
    }
    const { rows } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [payload.sub]);
    return { user: rows[0] || null, viaCookie: !bearer };
  }

  // Defence in depth against CSRF on cookie-authenticated writes: if the browser says the request
  // came from an origin we do not know, refuse it. (Bearer-token callers are not browsers.)
  function checkOrigin(req, viaCookie) {
    if (!viaCookie || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.get('origin');
    if (origin && config.allowedOrigins.length && !config.allowedOrigins.includes(origin)) {
      throw new AppError(403, 'BAD_ORIGIN', 'Cross-site request refused.');
    }
  }

  return {
    // Attaches req.user if logged in; never fails. Used by public pages that personalise.
    async optionalAuth(req, res, next) {
      const { user } = await identify(req);
      req.user = user || undefined;
      next();
    },
    async requireAuth(req, res, next) {
      const { user, viaCookie } = await identify(req);
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in.');
      checkOrigin(req, viaCookie);
      req.user = user;
      next();
    },
  };
}

// Role gate. Always placed AFTER requireAuth.
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
  next();
};

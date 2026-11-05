import jwt from 'jsonwebtoken';
import { AppError } from '../errors.js';

// Two separate sessions. An attendee logs in on the website, an organizer logs in on the organizer portal.
// Each has its own cookie and its own token audience, so one can never be used where the other is expected.
export const ATTENDEE = 'attendee';
export const ORGANIZER = 'organizer';
const COOKIE = { [ATTENDEE]: 'seatlock_token', [ORGANIZER]: 'seatlock_org_token' };
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

// `aud` says which portal the token is for. Default: organizer accounts get organizer tokens, everyone else attendee tokens.
export function signToken(config, user, aud = user.role === 'organizer' ? ORGANIZER : ATTENDEE) {
  return jwt.sign({ sub: String(user.id), aud }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '7d' });
}

export function setAuthCookie(config, res, token, aud = ATTENDEE) {
  res.cookie(COOKIE[aud], token, {
    httpOnly: true, // JavaScript on the page can never read the token, so XSS cannot steal it
    sameSite: 'lax', // not sent on cross-site POSTs, which is our main CSRF defence
    secure: config.isProd,
    maxAge: WEEK_MS,
    path: '/',
  });
}

export const clearAuthCookie = (config, res, aud = ATTENDEE) =>
  res.clearCookie(COOKIE[aud], { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' });

export function authMiddleware(ctx) {
  const { pool, config } = ctx;

  // Returns the user (loaded fresh from the DB so role changes apply immediately) or null.
  async function identify(req, aud) {
    const header = req.get('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || readCookie(req, COOKIE[aud]);
    if (!token) return { user: null };
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return { user: null, invalid: true };
    }
    if (payload.aud !== aud) return { user: null, invalid: true }; // a token for the other portal is not accepted here
    const { rows } = await pool.query('SELECT id, name, email, role, organization FROM users WHERE id = $1', [payload.sub]);
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

  // One factory for both portals, so the two guards cannot drift apart.
  const guard = (aud, ...roles) => async (req, res, next) => {
    const { user, viaCookie } = await identify(req, aud);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in.');
    if (roles.length && !roles.includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
    checkOrigin(req, viaCookie);
    req.user = user;
    req.portal = aud;
    next();
  };

  return {
    // Attaches req.user if an attendee is logged in; never fails. Used by public pages that personalise.
    async optionalAuth(req, res, next) {
      const { user } = await identify(req, ATTENDEE);
      req.user = user || undefined;
      next();
    },
    requireAuth: guard(ATTENDEE), // the website: participants, volunteers and admins
    // The organizer portal. Organizers use their own session; an ADMIN signed in on the website may manage everything
    // too (every event, its details, registrations, volunteers) without a separate organizer login.
    async requireOrganizer(req, res, next) {
      let found = await identify(req, ORGANIZER);
      if (!found.user) {
        const site = await identify(req, ATTENDEE);
        if (site.user?.role === 'admin') found = site; // only admins cross over; a participant or organizer site session never does
      }
      const { user, viaCookie } = found;
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in.');
      if (user.role !== 'organizer' && user.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
      checkOrigin(req, viaCookie);
      req.user = user;
      req.portal = ORGANIZER;
      next();
    },
    // Gate scanning is done from both places: volunteers on the website, organizers in their portal.
    async requireEither(req, res, next) {
      for (const aud of [ATTENDEE, ORGANIZER]) {
        const { user, viaCookie } = await identify(req, aud);
        if (user) { checkOrigin(req, viaCookie); req.user = user; req.portal = aud; return next(); }
      }
      throw new AppError(401, 'UNAUTHENTICATED', 'Please log in.');
    },
    identify,
  };
}

// Role gate. Always placed AFTER requireAuth.
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
  next();
};

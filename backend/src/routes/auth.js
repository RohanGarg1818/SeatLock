import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { parse, emailSchema } from '../util.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../middleware/auth.js';
import { rateLimit } from '../ratelimit.js';

// bcrypt only looks at the first 72 BYTES of a password; anything longer would be silently ignored.
const passwordSchema = z.string().min(8, 'At least 8 characters').refine((p) => Buffer.byteLength(p) <= 72, 'At most 72 bytes');

const registerSchema = z.object({ name: z.string().trim().min(1).max(100), email: emailSchema, password: passwordSchema });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export default function authRouter(ctx, { requireAuth }) {
  const r = Router();
  const { pool, config } = ctx;
  // Per-IP limits on the routes an attacker would hammer (credential stuffing, mass sign-ups).
  const limit = rateLimit(ctx, { name: 'auth', limit: config.rateLimit.authPerMin, by: 'ip' });
  // Compared against when the email is unknown, so "no such user" takes as long as "wrong password".
  const dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptCost);

  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

  r.post('/auth/register', limit, async (req, res) => {
    const { name, email, password } = parse(registerSchema, req.body);
    const hash = await bcrypt.hash(password, config.bcryptCost);
    // The UNIQUE constraint is the real duplicate check (a SELECT-then-INSERT would race);
    // the error handler turns users_email_key violations into 409 EMAIL_TAKEN.
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role`, [name, email, hash]);
    setAuthCookie(config, res, signToken(config, rows[0]));
    res.status(201).json({ user: publicUser(rows[0]), token: signToken(config, rows[0]) });
  });

  r.post('/auth/login', limit, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const { rows } = await pool.query('SELECT id, name, email, role, password_hash FROM users WHERE email = $1', [email]);
    const ok = await bcrypt.compare(password, rows[0]?.password_hash ?? dummyHash);
    if (!rows[0] || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password.');
    const token = signToken(config, rows[0]);
    setAuthCookie(config, res, token);
    res.json({ user: publicUser(rows[0]), token });
  });

  r.post('/auth/logout', (req, res) => {
    clearAuthCookie(config, res);
    res.json({ ok: true });
  });

  r.get('/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
  return r;
}

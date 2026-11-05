import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { parse, emailSchema } from '../util.js';
import { signToken, setAuthCookie, clearAuthCookie, ATTENDEE, ORGANIZER } from '../middleware/auth.js';
import { rateLimit } from '../ratelimit.js';

// bcrypt only looks at the first 72 BYTES of a password; anything longer would be silently ignored.
const passwordSchema = z.string().min(8, 'At least 8 characters').refine((p) => Buffer.byteLength(p) <= 72, 'At most 72 bytes');

const registerSchema = z.object({ name: z.string().trim().min(1).max(100), email: emailSchema, password: passwordSchema });
const organizerRegisterSchema = registerSchema.extend({ organization: z.string().trim().min(1, 'Tell us which society or club you run').max(120) });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export default function authRouter(ctx, { requireAuth, requireOrganizer }) {
  const r = Router();
  const { pool, config } = ctx;
  // Per-IP limits on the routes an attacker would hammer (credential stuffing, mass sign-ups).
  const limit = rateLimit(ctx, { name: 'auth', limit: config.rateLimit.authPerMin, by: 'ip' });
  // Compared against when the email is unknown, so "no such user" takes as long as "wrong password".
  const dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptCost);

  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, ...(u.organization && { organization: u.organization }) });
  const WRONG_PORTAL_ORG = new AppError(403, 'WRONG_PORTAL', 'This is an organizer account. Please log in through the organizer portal.');
  const WRONG_PORTAL_ATT = new AppError(403, 'WRONG_PORTAL', 'This is not an organizer account. Organizers sign up on this portal; attendees log in on the main site.');

  r.post('/auth/register', limit, async (req, res) => {
    const { name, email, password } = parse(registerSchema, req.body);
    const hash = await bcrypt.hash(password, config.bcryptCost);
    // The UNIQUE constraint is the real duplicate check (a SELECT-then-INSERT would race);
    // the error handler turns users_email_key violations into 409 EMAIL_TAKEN.
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role`, [name, email, hash]);
    const token = signToken(config, rows[0], ATTENDEE);
    setAuthCookie(config, res, token, ATTENDEE);
    res.status(201).json({ user: publicUser(rows[0]), token });
  });

  r.post('/auth/login', limit, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const { rows } = await pool.query('SELECT id, name, email, role, password_hash FROM users WHERE email = $1', [email]);
    const ok = await bcrypt.compare(password, rows[0]?.password_hash ?? dummyHash);
    if (!rows[0] || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password.');
    if (rows[0].role === 'organizer') throw WRONG_PORTAL_ORG; // checked only AFTER the password, so it reveals nothing to a stranger
    const token = signToken(config, rows[0], ATTENDEE);
    setAuthCookie(config, res, token, ATTENDEE);
    res.json({ user: publicUser(rows[0]), token });
  });

  r.post('/auth/logout', (req, res) => {
    clearAuthCookie(config, res);
    res.json({ ok: true });
  });

  r.get('/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  // ---- Organizer portal: its own sign-up, login and session cookie --------------------------------
  r.post('/organizer/auth/register', limit, async (req, res) => {
    const { name, email, password, organization } = parse(organizerRegisterSchema, req.body);
    const hash = await bcrypt.hash(password, config.bcryptCost);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, organization) VALUES ($1, $2, $3, 'organizer', $4)
       RETURNING id, name, email, role, organization`, [name, email, hash, organization]);
    const token = signToken(config, rows[0], ORGANIZER);
    setAuthCookie(config, res, token, ORGANIZER);
    res.status(201).json({ user: publicUser(rows[0]), token });
  });

  r.post('/organizer/auth/login', limit, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const { rows } = await pool.query('SELECT id, name, email, role, organization, password_hash FROM users WHERE email = $1', [email]);
    const ok = await bcrypt.compare(password, rows[0]?.password_hash ?? dummyHash);
    if (!rows[0] || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password.');
    if (rows[0].role !== 'organizer' && rows[0].role !== 'admin') throw WRONG_PORTAL_ATT;
    const token = signToken(config, rows[0], ORGANIZER);
    setAuthCookie(config, res, token, ORGANIZER);
    res.json({ user: publicUser(rows[0]), token });
  });

  r.post('/organizer/auth/logout', (req, res) => {
    clearAuthCookie(config, res, ORGANIZER);
    res.json({ ok: true });
  });

  r.get('/organizer/auth/me', requireOrganizer, (req, res) => res.json({ user: publicUser(req.user) }));

  // ---- Account settings (both portals): change your own name and password ------------------------------
  const nameSchema = z.object({ name: z.string().trim().min(1).max(100) });
  const orgSettingsSchema = nameSchema.extend({ organization: z.string().trim().min(1).max(120).optional() });
  const passwordChangeSchema = z.object({ current_password: z.string().min(1).max(200), new_password: passwordSchema });

  async function changePassword(req) {
    const { current_password, new_password } = parse(passwordChangeSchema, req.body);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(current_password, rows[0].password_hash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Your current password is wrong.');
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await bcrypt.hash(new_password, config.bcryptCost)]);
  }

  r.patch('/auth/me', requireAuth, async (req, res) => {
    const { name } = parse(nameSchema, req.body);
    const { rows } = await pool.query('UPDATE users SET name = $2 WHERE id = $1 RETURNING id, name, email, role, organization', [req.user.id, name]);
    res.json({ user: publicUser(rows[0]) });
  });
  r.post('/auth/password', requireAuth, limit, async (req, res) => { await changePassword(req); res.json({ ok: true }); });

  r.patch('/organizer/auth/me', requireOrganizer, async (req, res) => {
    const { name, organization } = parse(orgSettingsSchema, req.body);
    if (!organization && req.user.role !== 'admin') throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', { fields: { organization: 'Tell us which society or club you run' } });
    const { rows } = await pool.query('UPDATE users SET name = $2, organization = COALESCE($3, organization) WHERE id = $1 RETURNING id, name, email, role, organization', [req.user.id, name, organization ?? null]);
    res.json({ user: publicUser(rows[0]) });
  });
  r.post('/organizer/auth/password', requireOrganizer, limit, async (req, res) => { await changePassword(req); res.json({ ok: true }); });
  return r;
}

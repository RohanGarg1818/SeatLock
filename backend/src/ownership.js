import { AppError } from './errors.js';
import { EVENT_COLS } from './util.js';

// Loads an event the caller may manage (its organizer, or any admin). Non-owners get 404 rather than
// 403 so event ids cannot be probed. `lock: true` adds FOR UPDATE (use inside a transaction).
export async function getOwnedEvent(db, id, user, { lock = false } = {}) {
  const { rows } = await db.query(`SELECT ${EVENT_COLS}, e.is_demo FROM events e WHERE e.id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  const ev = rows[0];
  if (!ev || (ev.organizer_id !== user.id && user.role !== 'admin')) throw new AppError(404, 'EVENT_NOT_FOUND', 'Event not found.');
  return ev;
}

'use client';
import { useEffect, useState } from 'react';

// Who is logged in, asked from the BROWSER so the page itself can be cached and served instantly.
// The last answer is remembered in localStorage, so the header is right on the first paint of the next page.
export interface Session { user: { name: string; role: string } | null; volunteers: boolean; staff: { id: string; slug: string }[]; ready: boolean }
const KEY = 'seatlock:session';
const EMPTY: Session = { user: null, volunteers: false, staff: [], ready: false };

let inflight: Promise<Session> | null = null;
function load(): Promise<Session> {
  inflight ??= (async (): Promise<Session> => {
    try {
      const opts = { credentials: 'same-origin' as const, signal: AbortSignal.timeout(60_000) };
      // Both calls start together; the second one just answers 401 for a logged-out visitor.
      const [me, staff] = await Promise.all([fetch('/api/auth/me', opts), fetch('/api/me/staff-events', opts).catch(() => null)]);
      if (me.status !== 200) return { user: null, volunteers: false, staff: [], ready: true };
      const { user } = await me.json();
      const events: { id: string; slug: string }[] = staff?.ok ? (await staff.json()).events ?? [] : [];
      return { user: { name: user.name, role: user.role }, volunteers: events.length > 0, staff: events.map((e) => ({ id: e.id, slug: e.slug })), ready: true };
    } catch {
      inflight = null; // network trouble: let the next page try again
      return { ...readHint(), ready: true };
    }
  })();
  return inflight;
}
function readHint(): Session {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v?.user) return { user: v.user, volunteers: !!v.volunteers, staff: v.staff ?? [], ready: false }; } catch { /* storage blocked */ }
  return EMPTY;
}
export const clearSessionHint = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

export function useSession(): Session {
  const [s, setS] = useState<Session>(EMPTY); // same as the server render, so hydration matches
  useEffect(() => {
    let live = true;
    setS(readHint());
    load().then((r) => {
      if (!live) return;
      setS(r);
      try { if (r.user) localStorage.setItem(KEY, JSON.stringify({ user: r.user, volunteers: r.volunteers, staff: r.staff })); else localStorage.removeItem(KEY); } catch { /* ignore */ }
    });
    return () => { live = false; };
  }, []);
  return s;
}

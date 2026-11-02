'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { StaffRow } from '@/lib/types';

export default function StaffPanel({ eventId }: { eventId: string }) {
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<{ staff: StaffRow[] }>(`/events/${eventId}/staff`).then((r) => setStaff(r.staff)).catch(() => setStaff([])); }, [eventId]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api<{ staff: StaffRow }>(`/events/${eventId}/staff`, { body: { email } });
      setStaff((s) => (s?.some((x) => x.user_id === r.staff.user_id) ? s : [...(s ?? []), r.staff]));
      setEmail('');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong.'); }
    setBusy(false);
  }
  async function remove(userId: string) {
    setError(null);
    try { await api(`/events/${eventId}/staff/${userId}`, { method: 'DELETE' }); setStaff((s) => s?.filter((x) => x.user_id !== userId) ?? null); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong.'); }
  }

  return (
    <div className="max-w-xl">
      <p className="text-muted">Volunteers can scan tickets for this event and nothing else. They need an account first.</p>
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="grow"><label className="label" htmlFor="sv">Volunteer email</label><input id="sv" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={busy}>Add</button>
      </form>
      {error && <p role="alert" className="err mt-2">{error}</p>}
      {staff === null ? <p className="mt-4 text-muted">Loading…</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {staff.length === 0 && <li className="py-3 text-muted">No volunteers yet.</li>}
          {staff.map((s) => (
            <li key={s.user_id} className="flex items-center justify-between gap-3 py-3">
              <span><span className="font-medium">{s.name}</span> <span className="text-muted">{s.email}</span></span>
              <button className="btn btn-sm btn-danger" onClick={() => remove(s.user_id)} aria-label={`Remove ${s.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

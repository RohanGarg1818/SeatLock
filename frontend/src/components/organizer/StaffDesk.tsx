'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/format';
import type { Question, RegRow } from '@/lib/types';
import Scanner from '@/components/organizer/Scanner';

interface Desk { event: { id: string; title: string; venue: string; starts_at: string; capacity: number; registration_questions: Question[] | null }; stats: { confirmed: number; checked_in: number } }

// The volunteer's page for one event: scan tickets with the camera, and see the same registration sheet the organizer sees
// (registered people only), with a button to mark someone present by hand. Every call is re-checked by the API.
export default function StaffDesk({ eventId }: { eventId: string }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [rows, setRows] = useState<RegRow[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        api<Desk>(`/staff/events/${eventId}/desk`),
        api<{ registrations: RegRow[] }>(`/staff/events/${eventId}/registrations?limit=200${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`),
      ]);
      setDesk(d); setRows(r.registrations); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this event.'); }
  }, [eventId, q]);

  useEffect(() => {
    const t = setTimeout(refresh, 250); // debounce typing in the search box
    const id = setInterval(() => { if (!document.hidden) refresh(); }, 6000); // scans by other volunteers show up on their own
    return () => { clearTimeout(t); clearInterval(id); };
  }, [refresh]);

  async function markPresent(id: string) {
    setBusy(id);
    try { await api(`/staff/events/${eventId}/registrations/${id}/present`, { method: 'POST' }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not mark present.'); }
    setBusy(null);
  }

  if (error && !desk) return <p role="alert" className="err">{error}</p>;
  if (!desk) return <p className="text-muted">Loading the event…</p>;
  const questions = desk.event.registration_questions ?? [];
  return (
    <div>
      <h1 className="display text-4xl sm:text-5xl">{desk.event.title}</h1>
      <p className="mt-2 text-muted">{fmtDateTime(desk.event.starts_at)} · {desk.event.venue}</p>
      <p className="mt-5 text-lg"><b className="display num text-3xl">{desk.stats.checked_in}</b> of <b className="num">{desk.stats.confirmed}</b> registered are present</p>

      <h2 className="display mt-10 text-3xl">Scan tickets</h2>
      <div className="mt-4"><Scanner eventId={eventId} eventTitle={desk.event.title} /></div>

      <h2 className="display mt-12 text-3xl">Registrations</h2>
      <div className="mt-4"><label className="label" htmlFor="sq">Search name or email</label><input id="sq" className="field w-full max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <p role="alert" className="err mt-3">{error}</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Registered people</caption>
          <thead><tr className="bg-surface-2">
            <th scope="col" className="py-2 pr-4">Name</th><th scope="col" className="pr-4">Email</th><th scope="col" className="pr-4">Present</th>
            {questions.map((qq) => <th key={qq.id} scope="col" className="pr-4">{qq.label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top even:bg-surface-2/60">
                <td className="py-2 pr-4 font-medium">{r.name}</td><td className="pr-4">{r.email}</td>
                <td className="pr-4">{r.checked_in_at
                  ? <span className="tag" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Present · {fmtDateTime(r.checked_in_at)}</span>
                  : <button className="btn btn-sm" disabled={busy === r.id} onClick={() => markPresent(r.id)}>{busy === r.id ? 'Saving…' : 'Mark present'}</button>}</td>
                {questions.map((qq) => <td key={qq.id} className="pr-4">{String(r.answers?.[qq.id] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="mt-4 text-muted">No registered people match.</p>}
      </div>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/format';
import type { Question, RegRow } from '@/lib/types';

const FILTERS = [['', 'Active + cancelled'], ['CONFIRMED', 'Registered'], ['HELD', 'Held'], ['CANCELLED', 'Cancelled'], ['EXPIRED', 'Expired']] as const;

export default function RegistrationsPanel({ eventId, questions }: { eventId: string; questions: Question[] }) {
  const [rows, setRows] = useState<RegRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (reset: boolean, after?: string | null) => {
    setLoading(true); setError(null);
    const p = new URLSearchParams({ limit: '25' });
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (!reset && after) p.set('after', after); // keyset: "rows after the last id I have"
    try {
      const r = await api<{ registrations: RegRow[]; next_cursor: string | null }>(`/events/${eventId}/registrations?${p}`);
      setRows((old) => (reset ? r.registrations : [...old, ...r.registrations]));
      setCursor(r.next_cursor);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load registrations.'); }
    setLoading(false);
  }, [eventId, q, status]);

  // Re-query shortly after the filters change (debounce typing).
  useEffect(() => { const t = setTimeout(() => load(true), 250); return () => clearTimeout(t); }, [load]);

  const csvHref = `/api/events/${eventId}/registrations.csv`;
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="rq">Search name or email</label><input id="rq" className="field w-64" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label className="label" htmlFor="rs">Show</label>
          <select id="rs" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <a className="btn" href={csvHref} download>Download CSV</a>
      </div>
      {error && <p role="alert" className="err mt-3">{error}</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Registrations</caption>
          <thead><tr className="border-b-2 border-fg">
            <th scope="col" className="py-2 pr-4">Name</th><th scope="col" className="pr-4">Email</th><th scope="col" className="pr-4">Status</th>
            <th scope="col" className="pr-4">Registered</th><th scope="col" className="pr-4">Checked in</th>
            {questions.map((qq) => <th key={qq.id} scope="col" className="pr-4">{qq.label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top">
                <td className="py-2 pr-4 font-medium">{r.name}</td><td className="pr-4">{r.email}</td>
                <td className="pr-4"><span className="tag">{r.status}</span></td>
                <td className="pr-4">{r.confirmed_at ? fmtDateTime(r.confirmed_at) : '—'}</td>
                <td className="pr-4">{r.checked_in_at ? fmtDateTime(r.checked_in_at) : '—'}</td>
                {/* React escapes these strings; answers are user input and are never rendered as HTML. */}
                {questions.map((qq) => <td key={qq.id} className="pr-4">{String(r.answers?.[qq.id] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="mt-4 text-muted">No registrations match.</p>}
      </div>
      {cursor && <button className="btn mt-4" disabled={loading} onClick={() => load(false, cursor)}>{loading ? 'Loading…' : 'Load more'}</button>}
    </div>
  );
}

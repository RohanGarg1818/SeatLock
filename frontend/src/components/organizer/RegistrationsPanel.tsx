'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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

  const [present, setPresent] = useState<{ checked_in: number; confirmed: number } | null>(null);
  const rowCount = useRef(0);
  useEffect(() => { rowCount.current = rows.length; }, [rows.length]);

  const load = useCallback(async (reset: boolean, after?: string | null, silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    const p = new URLSearchParams({ limit: silent ? String(Math.min(200, Math.max(25, rowCount.current))) : '25' });
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (!reset && after) p.set('after', after); // keyset: "rows after the last id I have"
    try {
      const r = await api<{ registrations: RegRow[]; next_cursor: string | null }>(`/events/${eventId}/registrations?${p}`);
      setRows((old) => (reset ? r.registrations : [...old, ...r.registrations]));
      setCursor(r.next_cursor);
    } catch (e) { if (!silent) setError(e instanceof Error ? e.message : 'Could not load registrations.'); }
    if (!silent) setLoading(false);
  }, [eventId, q, status]);

  // The sheet updates itself: every few seconds (while this tab is visible) pull the latest rows and the
  // present-count, so a volunteer's scan at the gate shows up here without anyone pressing refresh.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      load(true, null, true);
      try { const r = await api<{ stats: { checked_in: number; confirmed: number } }>(`/events/${eventId}/stats`); setPresent(r.stats); } catch { /* keep the last numbers */ }
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [eventId, load]);

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
      {present && <p className="mt-5 text-lg"><b className="display num text-3xl">{present.checked_in}</b> of <b className="num">{present.confirmed}</b> registered are present <span className="hint">(updates live as volunteers scan)</span></p>}
      {error && <p role="alert" className="err mt-3">{error}</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Registrations</caption>
          <thead><tr className="bg-surface-2">
            <th scope="col" className="py-2 pr-4">Name</th><th scope="col" className="pr-4">Email</th><th scope="col" className="pr-4">Status</th>
            <th scope="col" className="pr-4">Registered</th><th scope="col" className="pr-4">Present</th>
            {questions.map((qq) => <th key={qq.id} scope="col" className="pr-4">{qq.label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top even:bg-surface-2/60">
                <td className="py-2 pr-4 font-medium">{r.name}</td><td className="pr-4">{r.email}</td>
                <td className="pr-4"><span className="tag">{r.status}</span></td>
                <td className="pr-4">{r.confirmed_at ? fmtDateTime(r.confirmed_at) : '—'}</td>
                <td className="pr-4">{r.checked_in_at ? <span className="tag" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Present · {fmtDateTime(r.checked_in_at)}</span> : <span className="text-muted">{r.status === 'CONFIRMED' ? 'Not yet' : '—'}</span>}</td>
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

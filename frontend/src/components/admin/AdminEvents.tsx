'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/format';
import type { AdminEventRow } from '@/lib/types';

export default function AdminEvents() {
  const [rows, setRows] = useState<AdminEventRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: string | null) => {
    setLoading(true);
    try {
      const r = await api<{ events: AdminEventRow[]; next_cursor: string | null }>(`/admin/events?limit=25${before ? `&before=${before}` : ''}`);
      setRows((old) => (before ? [...old, ...r.events] : r.events)); setCursor(r.next_cursor);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load events.'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {error && <p role="alert" className="err">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">All events</caption>
          <thead><tr className="bg-surface-2 text-left"><th scope="col" className="py-2 pr-4">Event</th><th scope="col" className="pr-4">Organizer</th><th scope="col" className="pr-4">Status</th><th scope="col" className="pr-4">Starts</th><th scope="col" className="pr-4">Registered</th><th scope="col" className="pr-4">Waitlist</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="align-top even:bg-surface-2/60">
                <td className="py-2 pr-4 font-medium">{e.status !== 'DRAFT' ? <Link className="underline underline-offset-4" href={`/e/${e.slug}`}>{e.title}</Link> : e.title}</td>
                <td className="pr-4">{e.organizer_name}<span className="block text-muted">{e.organizer_email}</span></td>
                <td className="pr-4"><span className="tag">{e.status}</span></td>
                <td className="pr-4">{fmtDateTime(e.starts_at)}</td>
                <td className="pr-4">{e.confirmed_count} / {e.capacity}</td>
                <td className="pr-4">{e.waitlist_count}</td>
                <td><Link className="btn btn-sm" href={`/organizer/events/${e.id}`}>Manage</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="mt-4 text-muted">No events yet.</p>}
      </div>
      {cursor && <button className="btn mt-4" disabled={loading} onClick={() => load(cursor)}>Load more</button>}
    </div>
  );
}

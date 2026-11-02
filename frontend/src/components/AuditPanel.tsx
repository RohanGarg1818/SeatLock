'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { fmtDateTime } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';

export default function AuditPanel({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (before?: string | null) => {
    setLoading(true);
    try {
      const r = await api<{ entries: AuditEntry[]; next_cursor: string | null }>(`/events/${eventId}/audit?limit=25${before ? `&before=${before}` : ''}`);
      setEntries((old) => (before ? [...old, ...r.entries] : r.entries)); setCursor(r.next_cursor);
    } catch { /* leave the list as is */ }
    setLoading(false);
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-2xl">
      <p className="text-muted">Every organizer action on this event, newest first. Entries are written in the same database transaction as the change itself.</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {!loading && entries.length === 0 && <li className="py-3 text-muted">Nothing yet.</li>}
        {entries.map((a) => (
          <li key={a.id} className="py-3 text-sm">
            <span className="font-mono font-semibold">{a.action}</span> <span className="text-muted">by {a.actor_name ?? 'unknown'} · {fmtDateTime(a.created_at)}</span>
            {a.details && Object.keys(a.details).length > 0 && <pre className="mt-1 overflow-x-auto text-xs text-muted">{JSON.stringify(a.details)}</pre>}
          </li>
        ))}
      </ul>
      {cursor && <button className="btn mt-4" disabled={loading} onClick={() => load(cursor)}>Load older</button>}
    </div>
  );
}

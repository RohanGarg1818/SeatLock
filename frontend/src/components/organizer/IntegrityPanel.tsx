'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { IntegrityReport as Report } from '@/lib/types';
import IntegrityReport from '@/components/organizer/IntegrityReport';

// Organizer button: "prove this event's numbers are right, right now". Read-only on the server.
export default function IntegrityPanel({ eventId }: { eventId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try { setReport((await api<{ integrity: Report }>(`/events/${eventId}/integrity`)).integrity); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not run the check.'); }
    setBusy(false);
  }

  return (
    <section className="mt-10" aria-labelledby="integrity-h">
      <h2 id="integrity-h" className="display text-2xl">Integrity check</h2>
      <p className="hint mt-1 max-w-2xl">Recomputes every seat number from the raw bookings and compares it with the counter, the waitlist and the cache. It only reads; nothing is changed.</p>
      <button className="btn mt-3" onClick={run} disabled={busy}>{busy ? 'Checking…' : report ? 'Check again' : 'Run integrity check'}</button>
      {error && <p role="alert" className="err mt-3">{error}</p>}
      {report && <div className="mt-4"><IntegrityReport report={report} /></div>}
    </section>
  );
}

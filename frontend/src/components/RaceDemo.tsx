'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';

interface Result {
  mode: string; capacity: number; requests_fired: number; response_codes: Record<string, number>; bookings_created: number;
  final_seats_left: number; oversold_by: number; invariant_held: boolean; counter_consistent: boolean; elapsed_ms: number;
}

function Card({ title, r, loading }: { title: string; r: Result | null; loading: boolean }) {
  return (
    <section className="card p-5" aria-live="polite">
      <h2 className="display text-2xl">{title}</h2>
      {loading && <p className="mt-4 text-muted">Running…</p>}
      {r && (
        <>
          <p className={`mt-4 display text-4xl ${r.invariant_held ? 'text-ok' : 'text-bad'}`}>{r.invariant_held ? 'No oversell' : `Oversold by ${r.oversold_by}`}</p>
          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Seats</dt><dd>{r.capacity}</dd>
            <dt className="text-muted">Requests</dt><dd>{r.requests_fired}</dd>
            <dt className="text-muted">Bookings created</dt><dd>{r.bookings_created}</dd>
            <dt className="text-muted">seats_left at the end</dt><dd>{r.final_seats_left} {r.counter_consistent ? '' : '(counter is wrong)'}</dd>
            <dt className="text-muted">Responses</dt><dd>{Object.entries(r.response_codes).map(([k, v]) => `${k}×${v}`).join(', ')}</dd>
            <dt className="text-muted">Time</dt><dd>{r.elapsed_ms} ms</dd>
          </dl>
        </>
      )}
    </section>
  );
}

export default function RaceDemo() {
  const [capacity, setCapacity] = useState('20');
  const [requests, setRequests] = useState('200');
  const [naive, setNaive] = useState<Result | null>(null);
  const [atomic, setAtomic] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setRunning(true); setError(null); setNaive(null); setAtomic(null);
    const body = { capacity: Number(capacity), requests: Number(requests) };
    try {
      // One after the other (not in parallel) so the two runs do not compete for the same database.
      setNaive(await api<Result>('/demo/race', { body: { ...body, mode: 'naive' } }));
      setAtomic(await api<Result>('/demo/race', { body: { ...body, mode: 'atomic' } }));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong.'); }
    setRunning(false);
  }

  return (
    <div>
      <form onSubmit={run} className="flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="rc">Seats</label><input id="rc" type="number" min={1} max={200} className="field w-32" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
        <div><label className="label" htmlFor="rr">Simultaneous requests</label><input id="rr" type="number" min={1} max={1000} className="field w-40" value={requests} onChange={(e) => setRequests(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={running}>{running ? 'Running…' : 'Run the race'}</button>
      </form>
      {error && <p role="alert" className="err mt-3">{error}</p>}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Card title="Naive: read, then write" r={naive} loading={running && !naive} />
        <Card title="SeatLock: one atomic UPDATE" r={atomic} loading={running && !!naive && !atomic} />
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { ChaosResult } from '@/lib/types';
import IntegrityReport from './IntegrityReport';

const FAILURES = [
  { key: 'retry_storm', label: 'Double-click storm', hint: 'Everyone sends the same request 3 times at once (nervous clicking, network retries).' },
  { key: 'multi_tab', label: 'Second browser tab', hint: 'Everyone also sends a separate request with a different key, as if from another tab.' },
  { key: 'redis_outage', label: 'Redis dies mid-rush', hint: 'The cache is switched off in the middle of the sale and comes back with stale numbers.' },
  { key: 'waitlist', label: 'Waitlist', hint: 'People who were turned away join the waitlist and get promoted when seats free up.' },
  { key: 'cancel_churn', label: 'Cancellations', hint: '30% of the winners cancel while the others keep retrying.' },
  { key: 'expire_holds', label: 'Holds time out', hint: '25% of the holds expire and the sweeper frees them during the rush.' },
] as const;
type Key = (typeof FAILURES)[number]['key'];

export default function ChaosLab() {
  const [seats, setSeats] = useState('25');
  const [crowd, setCrowd] = useState('300');
  const [on, setOn] = useState<Record<Key | 'sabotage', boolean>>({ retry_storm: true, multi_tab: true, redis_outage: true, waitlist: true, cancel_churn: true, expire_holds: true, sabotage: false });
  const [result, setResult] = useState<ChaosResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setRunning(true); setError(null); setResult(null);
    try { setResult(await api<ChaosResult>('/demo/chaos', { body: { capacity: Number(seats), users: Number(crowd), ...on } })); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong.'); }
    setRunning(false);
  }
  const toggle = (k: Key | 'sabotage') => setOn((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div>
      <form onSubmit={run}>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label" htmlFor="cs">Seats</label><input id="cs" type="number" min={1} max={200} className="field w-28" value={seats} onChange={(e) => setSeats(e.target.value)} /></div>
          <div><label className="label" htmlFor="cu">People</label><input id="cu" type="number" min={2} max={500} className="field w-28" value={crowd} onChange={(e) => setCrowd(e.target.value)} /></div>
        </div>
        <fieldset className="mt-5">
          <legend className="label">Break things while they register</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {FAILURES.map((f) => (
              <label key={f.key} className="card flex cursor-pointer items-start gap-3 p-3">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={on[f.key]} onChange={() => toggle(f.key)} />
                <span><span className="font-semibold">{f.label}</span><br /><span className="hint">{f.hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="card mt-3 flex cursor-pointer items-start gap-3 border-bad p-3">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={on.sabotage} onChange={() => toggle('sabotage')} />
          <span><span className="font-semibold text-bad">Sabotage: use the broken booking code</span><br /><span className="hint">Swaps in the naive read-then-write version. The verdict must turn red. This is how you see that the checker is not rigged.</span></span>
        </label>
        <button className="btn btn-primary mt-5" disabled={running}>{running ? 'Running the experiment…' : 'Run the experiment'}</button>
      </form>

      {error && <p role="alert" className="err mt-4">{error}</p>}
      {result && (
        <div className="mt-8 grid gap-8">
          <section aria-labelledby="verdict-h">
            <h2 id="verdict-h" className="display text-2xl">Verdict</h2>
            <p className="hint mt-1">{result.requests_sent} real HTTP requests in {result.elapsed_ms} ms. End state: {result.end_state.active} of {result.end_state.capacity} seats taken, {result.end_state.cancelled} cancelled, {result.end_state.expired} expired.</p>
            <div className="mt-3"><IntegrityReport report={result.report} /></div>
          </section>
          <section aria-labelledby="tl-h">
            <h2 id="tl-h" className="display text-2xl">What happened</h2>
            <ol className="mt-3 divide-y divide-line border border-line">
              {result.timeline.map((t, i) => (
                <li key={i} className="flex gap-4 p-3"><span className="w-16 shrink-0 text-sm text-muted">{t.at_ms} ms</span><span>{t.detail}</span></li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="rc-h">
            <h2 id="rc-h" className="display text-2xl">Every response the server gave</h2>
            <p className="mt-2 text-sm text-muted">{Object.entries(result.response_codes).sort().map(([k, v]) => `${k} ×${v}`).join('   ·   ')}</p>
          </section>
        </div>
      )}
    </div>
  );
}

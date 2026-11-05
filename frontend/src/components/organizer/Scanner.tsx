'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Scanner as QrScanner, setZXingModuleOverrides } from '@yudiel/react-qr-scanner';
import { api, ApiError } from '@/lib/client';
import { fmtDateTime } from '@/lib/format';
import Icon from '@/components/ui/Icon';

interface Detail { label: string; value: string }
interface Outcome { ok: boolean; title: string; detail: string; email?: string; details?: Detail[]; verifyToken?: string }
interface ScanResponse { result: 'OK' | 'VALID'; attendee: string; email: string; details: Detail[]; registered_at: string | null }

// By default the QR decoder downloads its WebAssembly file from a public CDN at scan time. A gate with bad Wi-Fi, a
// corporate firewall or a strict CSP would then silently fail, so we serve the file ourselves (copied into /public by `npm run copy-wasm`).
setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? `/${path}` : prefix + path) });

/** Plain-language reason for every way a scan can fail, keyed by the API's error code. */
function explain(e: unknown): Outcome {
  if (!(e instanceof ApiError)) return { ok: false, title: 'No result', detail: 'Something went wrong. Scan again.' };
  const d = e.details as { attendee?: string; checked_in_at?: string; checked_in_by?: { name?: string } } | undefined;
  switch (e.code) {
    case 'ALREADY_CHECKED_IN':
      return { ok: false, title: 'Already checked in', detail: `${d?.attendee ?? 'This person'}${d?.checked_in_at ? ` at ${fmtDateTime(d.checked_in_at)}` : ''}${d?.checked_in_by?.name ? ` by ${d.checked_in_by.name}` : ''}` };
    case 'WRONG_EVENT': return { ok: false, title: 'Wrong event', detail: 'This ticket is for a different event.' };
    case 'INVALID_TICKET': case 'VALIDATION_FAILED': return { ok: false, title: 'Not a valid ticket', detail: 'This QR code was not issued by SeatLock, or it was altered.' };
    case 'BOOKING_CANCELLED': return { ok: false, title: 'Booking cancelled', detail: d?.attendee ? `${d.attendee} cancelled this registration.` : 'This registration was cancelled.' };
    case 'NOT_CONFIRMED': return { ok: false, title: 'Not confirmed', detail: 'This registration was never completed.' };
    case 'NOT_STAFF': return { ok: false, title: 'Not allowed', detail: 'You are not a volunteer or organizer for this event.' };
    case 'RATE_LIMITED': return { ok: false, title: 'Slow down', detail: 'Too many scans. Wait a few seconds.' };
    case 'NETWORK': return { ok: false, title: 'No connection', detail: 'Could not reach the server. Scan again when online.' };
    default: return { ok: false, title: 'Rejected', detail: e.message };
  }
}

export default function Scanner({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [count, setCount] = useState(0);
  const [token, setToken] = useState('');
  const [verifyOnly, setVerifyOnly] = useState(false);
  const verifyRef = useRef(false);
  useEffect(() => { verifyRef.current = verifyOnly; }, [verifyOnly]);
  const [camError, setCamError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false); // the camera starts only when the volunteer taps the button
  const [recent, setRecent] = useState<{ name: string; at: Date }[]>([]);
  const busy = useRef(false);
  const last = useRef<{ token: string; at: number }>({ token: '', at: 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const submit = useCallback(async (t: string, opts: { force?: boolean } = {}) => {
    // Debounce: the camera reports the same QR many times a second. One request at a time, and the same code
    // is ignored for 3s (the server would answer "already checked in", which would flash red over the green).
    const now = Date.now();
    if (!opts.force && (busy.current || (last.current.token === t && now - last.current.at < 3000))) return;
    if (busy.current) return;
    busy.current = true; last.current = { token: t, at: now };
    const preview = verifyRef.current && !opts.force;
    clearTimeout(timer.current);
    try {
      const r = await api<ScanResponse>('/checkin', { body: { token: t, event_id: eventId, ...(preview && { preview: true }) } });
      if (preview) {
        // Verify only: show who this is and let the volunteer decide. Nothing was written.
        setOutcome({ ok: true, title: 'Valid ticket', detail: r.attendee, email: r.email, details: r.details, verifyToken: t });
      } else {
        setCount((c) => c + 1);
        setRecent((l) => [{ name: r.attendee, at: new Date() }, ...l].slice(0, 8));
        setOutcome({ ok: true, title: 'Checked in', detail: r.attendee, email: r.email, details: r.details });
        timer.current = setTimeout(() => setOutcome(null), 4000);
      }
    } catch (e) {
      setOutcome(explain(e));
      timer.current = setTimeout(() => setOutcome(null), 3500);
    }
    busy.current = false;
  }, [eventId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div>
      <p className="text-muted">{eventTitle} · <strong className="text-fg">{count}</strong> checked in on this device</p>

      {!cameraOn ? (
        <div className="mt-4 max-w-md rounded-2xl bg-surface-2 p-6">
          <p className="display text-2xl">Scan attendee tickets</p>
          <p className="mt-2 text-muted">Open the camera and point it at the QR code on the attendee&apos;s phone or printout. A valid ticket is marked present on the registration sheet at once.</p>
          <button type="button" className="btn btn-primary btn-lg mt-5 w-full" onClick={() => { setCamError(null); setCameraOn(true); }}>Open camera</button>
        </div>
      ) : (
        <div className="mt-4 max-w-md">
          <div className="overflow-hidden border-2 border-fg" aria-label="Camera viewfinder">
            {camError ? <p className="p-6" role="alert">{camError} Use the box below to paste a ticket code instead.</p> : (
              <QrScanner
                onScan={(codes) => { const v = codes[0]?.rawValue; if (v) submit(v); }}
                onError={(e) => setCamError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow the camera for this site in your browser settings, then try again.' : 'The camera is not available.')}
                constraints={{ facingMode: 'environment' }}
                scanDelay={300}
                paused={!!outcome}
              />
            )}
          </div>
          <button type="button" className="btn btn-sm mt-3" onClick={() => setCameraOn(false)}>Close camera</button>
        </div>
      )}

      <label className="mt-4 flex max-w-md items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--accent)]" checked={verifyOnly} onChange={(e) => setVerifyOnly(e.target.checked)} />
        <span><span className="font-semibold">Verify only</span><span className="hint block">Show who the ticket belongs to and their answers without checking them in. You then tap &quot;Check in now&quot;.</span></span>
      </label>

      <form className="mt-6 max-w-md" onSubmit={(e) => { e.preventDefault(); if (token.trim()) { submit(token.trim()); setToken(''); } }}>
        <label className="label" htmlFor="tok">Camera not working? Paste the ticket code</label>
        <div className="flex gap-2"><input id="tok" className="field text-sm" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /><button className="btn btn-primary">Check in</button></div>
      </form>

      {recent.length > 0 && (
        <section className="mt-8 max-w-md" aria-label="Marked present on this device">
          <h2 className="display text-2xl">Marked present</h2>
          <ul className="mt-3 space-y-1.5 [&>li]:rounded-2xl [&>li]:bg-surface-2 [&>li]:px-3">
            {recent.map((r, i) => <li key={i} className="flex justify-between gap-4 py-2"><span className="font-medium">{r.name}</span><span className="num text-muted">{r.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></li>)}
          </ul>
        </section>
      )}

      {/* Full-screen result. Colour AND a glyph AND words: it must be readable in sunlight and by colour-blind volunteers. */}
      {outcome && (
        <div role="alert" data-testid="scan-result" onClick={() => setOutcome(null)}
          className={`fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center overflow-y-auto p-8 text-center ${outcome.ok ? 'bg-[#14803c] text-white' : 'bg-[#b42318] text-white'}`}>
          <Icon name={outcome.ok ? 'check' : 'close'} size={128} className="shrink-0" />
          <p className="display mt-4 text-5xl">{outcome.title}</p>
          <p className="mt-3 text-3xl font-semibold">{outcome.detail}</p>
          {outcome.email && <p className="mt-1 text-lg opacity-90">{outcome.email}</p>}
          {outcome.details && outcome.details.length > 0 && (
            <dl className="mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left text-lg" data-testid="scan-details">
              {outcome.details.map((d) => (<div key={d.label} className="contents"><dt className="opacity-80">{d.label}</dt><dd className="font-semibold">{d.value}</dd></div>))}
            </dl>
          )}
          {outcome.verifyToken && (
            <button className="btn btn-primary mt-8 !border-white !bg-white !text-[#14803c]" onClick={(e) => { e.stopPropagation(); void submit(outcome.verifyToken!, { force: true }); }}>Check in now</button>
          )}
          <p className="mt-8 text-sm opacity-80">Tap anywhere to dismiss</p>
        </div>
      )}
    </div>
  );
}

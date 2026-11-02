'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client';
import { fmtDateTime } from '@/lib/format';
import type { Booking, MyBooking, MyWaitlist, PublicEvent, RegState } from '@/lib/types';
import QuestionField from './QuestionField';

type Phase = 'idle' | 'holding' | 'form' | 'confirming' | 'done' | 'expired';
interface Live { seats_left: number; registration_state: RegState; my_booking: MyBooking | null; my_waitlist: MyWaitlist | null; waitlist_count: number }

const POLL_MS = 3000;

function fmtCountdown(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export default function RegisterPanel({ event, initialMyBooking, initialWaitlist = null, loggedIn }: { event: PublicEvent; initialMyBooking: MyBooking | null; initialWaitlist?: MyWaitlist | null; loggedIn: boolean }) {
  const router = useRouter();
  const questions = event.registration_questions ?? [];

  // ---- live seat count: poll every 3 s (paused while the tab is hidden) ----
  const [live, setLive] = useState<Live>({ seats_left: event.seats_left, registration_state: event.registration_state, my_booking: initialMyBooking, my_waitlist: initialWaitlist, waitlist_count: event.waitlist_count ?? 0 });
  const [tick, setTick] = useState(0); // bumps when the seat count changes, to replay the tiny animation
  const lastSeats = useRef(event.seats_left);
  const poll = useCallback(async () => {
    try {
      const r = await api<{ event: PublicEvent; my_booking: MyBooking | null; my_waitlist: MyWaitlist | null }>(`/public/events/${event.slug}`);
      setLive({ seats_left: r.event.seats_left, registration_state: r.event.registration_state, my_booking: r.my_booking, my_waitlist: r.my_waitlist, waitlist_count: r.event.waitlist_count ?? 0 });
      if (r.event.seats_left !== lastSeats.current) { lastSeats.current = r.event.seats_left; setTick((t) => t + 1); }
    } catch { /* keep showing the last known numbers */ }
  }, [event.slug]);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);

  // ---- registration attempt state ----
  const [phase, setPhase] = useState<Phase>('idle');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [wlBusy, setWlBusy] = useState(false);
  // One Idempotency-Key per ATTEMPT, reused on retries (a lost response then returns the SAME booking instead of
  // grabbing a second seat). It is cleared when the attempt reaches a final outcome.
  const attemptKey = useRef<string | null>(null);

  // countdown: based on the SERVER's "seconds left" and the browser's monotonic clock, so a wrong device clock cannot distort it
  const deadline = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (phase !== 'form' && phase !== 'confirming') return;
    const id = setInterval(() => {
      const left = Math.ceil((deadline.current - performance.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0 && phase === 'form') { setPhase('expired'); attemptKey.current = null; poll(); }
    }, 250);
    return () => clearInterval(id);
  }, [phase, poll]);

  // countdown to the registration opening
  const offset = useRef(event.server_time ? Date.parse(event.server_time) - Date.now() : 0);
  const [untilOpen, setUntilOpen] = useState(0);
  useEffect(() => {
    if (live.registration_state !== 'NOT_OPEN') return;
    const update = () => setUntilOpen(Math.max(0, (Date.parse(event.registration_opens_at) - (Date.now() + offset.current)) / 1000));
    update();
    const id = setInterval(() => { update(); if (Date.parse(event.registration_opens_at) <= Date.now() + offset.current) poll(); }, 1000);
    return () => clearInterval(id);
  }, [live.registration_state, event.registration_opens_at, poll]);

  function startHold(b: { id: string; status: string; hold_seconds_left?: number }) {
    setBookingId(b.id);
    if (b.status === 'CONFIRMED') { setPhase('done'); attemptKey.current = null; return; }
    deadline.current = performance.now() + (b.hold_seconds_left ?? 0) * 1000;
    setSecondsLeft(b.hold_seconds_left ?? 0);
    if (questions.length === 0) { void confirm(b.id, {}); return; } // no form: hold + confirm in one click
    setPhase('form');
  }

  function fail(err: unknown) {
    if (err instanceof ApiError) {
      setMessage(err.message);
      const transient = err.code === 'NETWORK' || err.status >= 500 || err.status === 429;
      setRetryable(transient);
      if (!transient) attemptKey.current = null; // final answer: next click is a brand-new attempt
      if (err.code === 'HOLD_EXPIRED') setPhase('expired'); else setPhase('idle');
    } else { setMessage('Something went wrong.'); setPhase('idle'); }
    poll();
  }

  async function register() {
    if (!loggedIn) { router.push(`/login?next=${encodeURIComponent(`/e/${event.slug}`)}`); return; }
    setMessage(null); setRetryable(false); setFieldErrors({}); setPhase('holding');
    attemptKey.current ??= crypto.randomUUID();
    try {
      const r = await api<{ booking: Booking }>(`/events/${event.id}/hold`, { method: 'POST', body: {}, headers: { 'Idempotency-Key': attemptKey.current } });
      startHold(r.booking);
    } catch (err) {
      // "You already have a booking": take them to it instead of showing an error.
      if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED' && err.details?.booking_id) {
        try { const r = await api<{ booking: Booking }>(`/bookings/${err.details.booking_id}`); startHold(r.booking); return; } catch { /* fall through */ }
      }
      fail(err);
    }
  }

  async function resume() {
    if (!live.my_booking) return;
    setMessage(null); setPhase('holding');
    try { const r = await api<{ booking: Booking }>(`/bookings/${live.my_booking.id}`); startHold(r.booking); } catch (err) { fail(err); }
  }

  async function confirm(id: string, a: Record<string, unknown>) {
    setPhase('confirming'); setFieldErrors({}); setMessage(null);
    try {
      await api(`/bookings/${id}/confirm`, { body: { answers: a } });
      setPhase('done'); attemptKey.current = null; poll(); router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setFieldErrors(err.details?.fields ?? {}); setMessage('Please fix the highlighted answers.'); setPhase('form'); return;
      }
      if (err instanceof ApiError && err.code === 'NETWORK') { setMessage(err.message); setPhase('form'); return; } // hold still ticking; they can resubmit
      fail(err);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookingId) return;
    // Turn form strings into the types the API validates: numbers as numbers, blank optional fields omitted.
    const out: Record<string, unknown> = {};
    for (const q of questions) {
      const v = answers[q.id];
      if (q.type === 'checkbox') out[q.id] = v === true;
      else if (v === undefined || v === '') continue;
      else out[q.id] = q.type === 'number' ? Number(v) : v;
    }
    void confirm(bookingId, out);
  }

  async function release() {
    if (!bookingId) return;
    try { await api(`/bookings/${bookingId}/cancel`, { method: 'POST', body: {} }); } catch { /* the hold will expire anyway */ }
    attemptKey.current = null; setPhase('idle'); setBookingId(null); setMessage('Your seat was released.'); poll();
  }

  // ---------------------------------------------------------------- rendering
  const seatsText = (
    <p aria-live="polite" className="text-lg">
      <span key={tick} className="seat-tick display inline-block text-4xl">{live.seats_left}</span>
      <span className="text-muted"> of {event.capacity} seats left</span>
    </p>
  );

  if (phase === 'form' || phase === 'confirming') {
    const urgent = secondsLeft <= 30;
    return (
      <section aria-labelledby="reg-h" className="card p-5">
        <h2 id="reg-h" className="display text-2xl">Almost there</h2>
        <p role="timer" className={`mt-2 font-semibold ${urgent ? 'text-bad' : ''}`}>
          Your seat is held for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </p>
        <p className="hint">Finish before the timer ends or the seat goes back to the pool.</p>
        {message && <p role="alert" className="err mt-3">{message}</p>}
        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          {questions.map((q) => (
            <QuestionField key={q.id} q={q} value={answers[q.id]} error={fieldErrors[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          ))}
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={phase === 'confirming'}>{phase === 'confirming' ? 'Confirming…' : 'Confirm registration'}</button>
            <button type="button" className="btn" onClick={release} disabled={phase === 'confirming'}>Release my seat</button>
          </div>
        </form>
      </section>
    );
  }

  if (phase === 'done' || live.my_booking?.status === 'CONFIRMED') {
    return (
      <section className="card border-ok p-5" aria-live="polite">
        <p className="display text-2xl text-ok">You&apos;re registered</p>
        <p className="mt-1 text-muted">Your QR ticket is ready.</p>
        <Link className="btn btn-primary mt-4 w-full" href={`/me/tickets/${bookingId ?? live.my_booking?.id}`}>View ticket</Link>
      </section>
    );
  }

  if (phase === 'expired') {
    return (
      <section className="card p-5" role="alert">
        <p className="display text-2xl">Your hold expired</p>
        <p className="mt-2 text-muted">The seat was released so others could have it. {live.seats_left > 0 ? 'There are still seats left, so you can try again.' : 'The event is sold out right now, but seats can come back if someone cancels.'}</p>
        <button className="btn btn-primary mt-4 w-full" onClick={() => { setPhase('idle'); void register(); }} disabled={live.seats_left === 0}>Try again</button>
      </section>
    );
  }

  async function joinWaitlist() {
    if (!loggedIn) { router.push(`/login?next=${encodeURIComponent(`/e/${event.slug}`)}`); return; }
    setWlBusy(true); setMessage(null);
    try { const r = await api<{ waitlist: MyWaitlist }>(`/events/${event.id}/waitlist`, { method: 'POST', body: {} }); setLive((l) => ({ ...l, my_waitlist: r.waitlist })); void poll(); }
    catch (err) { setMessage(err instanceof ApiError ? err.message : 'Something went wrong.'); void poll(); }
    setWlBusy(false);
  }
  async function leaveWaitlist() {
    setWlBusy(true); setMessage(null);
    try { await api(`/events/${event.id}/waitlist`, { method: 'DELETE' }); setLive((l) => ({ ...l, my_waitlist: null })); void poll(); }
    catch (err) { setMessage(err instanceof ApiError ? err.message : 'Something went wrong.'); }
    setWlBusy(false);
  }

  const busy = phase === 'holding';
  let action: React.ReactNode;
  if (live.my_booking?.status === 'HELD') {
    action = <button className="btn btn-primary w-full" onClick={resume} disabled={busy}>Continue your registration</button>;
  } else if (live.registration_state === 'OPEN') {
    action = <button className="btn btn-primary w-full" onClick={register} disabled={busy}>{busy ? 'Holding your seat…' : loggedIn ? 'Register' : 'Log in to register'}</button>;
  } else if (live.registration_state === 'NOT_OPEN') {
    action = <button className="btn w-full" disabled>Opens in {fmtCountdown(untilOpen)}</button>;
  } else if (live.registration_state === 'SOLD_OUT' && live.my_waitlist) {
    action = (
      <div role="status" aria-live="polite">
        <p className="display text-2xl">You&apos;re #{live.my_waitlist.position} in line</p>
        <p className="mt-1 text-muted">If someone cancels, the seat is held for you automatically and you get a short window to finish registering. Keep this page open, or check <Link className="underline underline-offset-4" href="/me">My tickets</Link> later.</p>
        <button className="btn btn-sm mt-3" onClick={leaveWaitlist} disabled={wlBusy}>Leave the waitlist</button>
      </div>
    );
  } else if (live.registration_state === 'SOLD_OUT') {
    action = (
      <div>
        <button className="btn w-full" disabled>Sold out</button>
        <button className="btn btn-primary mt-3 w-full" onClick={joinWaitlist} disabled={wlBusy}>{wlBusy ? 'Joining…' : loggedIn ? 'Join the waitlist' : 'Log in to join the waitlist'}</button>
        <p className="hint mt-2">{live.waitlist_count > 0 ? `${live.waitlist_count} waiting. ` : ''}Seats come back when people cancel or their hold runs out; the first in line gets them.</p>
      </div>
    );
  } else {
    const label = { SOLD_OUT: 'Sold out', CLOSED: 'Registration closed', CANCELLED: 'Event cancelled' }[live.registration_state as 'SOLD_OUT' | 'CLOSED' | 'CANCELLED'];
    action = <button className="btn w-full" disabled>{label}</button>;
  }
  return (
    <section aria-label="Registration" className="card p-5">
      {live.registration_state !== 'CANCELLED' && seatsText}
      {event.allowed_email_domains?.length ? <p className="hint mt-2">Open to {event.allowed_email_domains.map((d) => `@${d}`).join(', ')} email addresses.</p> : null}
      <p className="hint mt-2">Registration {live.registration_state === 'NOT_OPEN' ? 'opens' : 'opened'} {fmtDateTime(event.registration_opens_at)}{event.registration_closes_at ? `, closes ${fmtDateTime(event.registration_closes_at)}` : ''}.</p>
      <div className="mt-4">{action}</div>
      {message && <p role="alert" className="err mt-3">{message}{retryable && ' Press the button to try again.'}</p>}
      {live.registration_state === 'OPEN' && <p className="hint mt-3">You get {event.hold_minutes ?? 5} minutes to finish after clicking Register.</p>}
    </section>
  );
}

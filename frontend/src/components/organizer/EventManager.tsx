'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client';
import type { EventStats, OrganizerEvent } from '@/lib/types';
import EventForm from '@/components/organizer/EventForm';
import RegistrationsPanel from '@/components/organizer/RegistrationsPanel';
import StaffPanel from '@/components/organizer/StaffPanel';
import IntegrityPanel from '@/components/organizer/IntegrityPanel';

const TABS = ['Overview', 'Details', 'Registrations', 'Team'] as const;
type Tab = (typeof TABS)[number];

export default function EventManager({ initialEvent, initialStats }: { initialEvent: OrganizerEvent; initialStats: EventStats }) {
  const router = useRouter();
  const [event, setEvent] = useState(initialEvent);
  const [stats, setStats] = useState(initialStats);
  const [tab, setTab] = useState<Tab>('Overview');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState(String(initialEvent.capacity));

  const refresh = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([
        api<{ event: OrganizerEvent }>(`/events/${event.id}`),
        api<{ stats: EventStats }>(`/events/${event.id}/stats`),
      ]);
      setEvent(e.event); setStats(s.stats); setCap(String(e.event.capacity));
    } catch { /* keep showing the last numbers; the next poll will try again */ }
  }, [event.id]);

  // Live numbers while the Overview tab is open. Polling (not SSE): see docs/DESIGN.md. Paused when the tab is hidden.
  useEffect(() => {
    if (tab !== 'Overview') return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 3000);
    return () => clearInterval(t);
  }, [tab, refresh]);

  async function act(label: string, fn: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setMsg(null);
    try { await fn(); await refresh(); setMsg({ ok: true, text: label }); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message + (e.details?.fields ? ' ' + Object.values(e.details.fields).join('. ') : '') : 'Something went wrong.' }); }
    setBusy(false);
  }

  const active = stats.held + stats.confirmed;
  const pct = event.capacity ? Math.min(100, Math.round((active / event.capacity) * 100)) : 0;
  // Once anyone has registered, question edits are restricted by the API; the form shows why.
  const locked = stats.held + stats.confirmed + stats.cancelled + stats.expired > 0;
  const editable = event.status === 'DRAFT' || event.status === 'PUBLISHED';

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-4xl">{event.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-muted"><span className="tag">{event.status}</span>
            {event.status !== 'DRAFT' && <Link className="underline underline-offset-4" href={`/e/${event.slug}`}>Public page</Link>}</p>
        </div>
        {event.status === 'PUBLISHED' && <Link className="btn btn-primary" href={`/organizer/events/${event.id}/checkin`}>Open scanner</Link>}
      </div>

      <div role="tablist" aria-label="Event sections" className="mt-6 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => setTab(t)}
            className={`min-h-11 px-5 font-bold ${tab === t ? 'rounded-full border-2 border-ink-line bg-accent text-accent-ink' : 'rounded-full border-2 border-transparent text-muted hover:bg-surface-2 hover:text-fg'}`}>{t}</button>
        ))}
      </div>

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`card mt-4 p-3 ${msg.ok ? 'border-ok text-ok' : 'border-bad text-bad'}`}>{msg.text}</p>}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === 'Overview' && (
          <div className="space-y-8">
            <div>
              <div className="flex items-baseline justify-between"><p className="display text-5xl">{stats.seats_left}<span className="text-xl text-muted"> seats left of {event.capacity}</span></p></div>
              <div className="mt-3 h-3 border border-fg" role="img" aria-label={`${pct}% of seats taken`}><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-6">
              {([['Registered', stats.confirmed], ['Held', stats.held], ['Waitlist', stats.waitlist ?? 0], ['Checked in', stats.checked_in], ['Cancelled', stats.cancelled], ['Expired', stats.expired]] as const).map(([k, v]) => (
                <div key={k} className="card p-4"><dt className="hint">{k}</dt><dd className="display text-3xl">{v}</dd></div>
              ))}
            </dl>

            <div className="flex flex-wrap items-end gap-6">
              {event.status === 'DRAFT' && <button className="btn btn-primary" disabled={busy} onClick={() => act('Published. Registration opens at the time you set.', () => api(`/events/${event.id}/publish`, { method: 'POST', body: {} }))}>Publish</button>}
              {event.status === 'PUBLISHED' && <button className="btn" disabled={busy} onClick={() => act('Marked as completed.', () => api(`/events/${event.id}/complete`, { method: 'POST', body: {} }), 'Mark this event as completed? Registration closes for good.')}>Mark completed</button>}
              {event.status === 'PUBLISHED' && <button className="btn btn-danger" disabled={busy} onClick={() => act('Event cancelled. Every active booking was cancelled.', () => api(`/events/${event.id}/cancel`, { method: 'POST', body: {} }), 'Cancel this event? All registrations are cancelled. This cannot be undone.')}>Cancel event</button>}
              {event.status === 'DRAFT' && <button className="btn btn-danger" disabled={busy} onClick={() => act('Deleted.', async () => { await api(`/events/${event.id}`, { method: 'DELETE' }); router.push('/organizer'); }, 'Delete this draft?')}>Delete draft</button>}
            </div>

            {editable && (
              <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); act('Capacity updated.', () => api(`/events/${event.id}/capacity`, { method: 'PATCH', body: { capacity: Number(cap) } })); }}>
                <div><label className="label" htmlFor="cap">Capacity</label><input id="cap" type="number" min={1} className="field w-40" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
                <button className="btn" disabled={busy || Number(cap) === event.capacity}>Update capacity</button>
                <p className="hint basis-full">You can raise it any time, or lower it down to the number of active registrations ({active}), no further.</p>
              </form>
            )}
            <IntegrityPanel eventId={event.id} />
          </div>
        )}
        {tab === 'Details' && (
          editable
            ? <div className="max-w-2xl"><EventForm event={event} locked={locked} onSaved={(e) => setEvent(e)} /></div>
            : <p className="text-muted">A {event.status.toLowerCase()} event can no longer be edited.</p>
        )}
        {tab === 'Registrations' && <RegistrationsPanel eventId={event.id} questions={event.registration_questions ?? []} />}
        {tab === 'Team' && <StaffPanel eventId={event.id} />}
      </div>
    </div>
  );
}

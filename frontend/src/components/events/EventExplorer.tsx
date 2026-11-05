'use client';
import { useEffect, useMemo, useState } from 'react';
import type { PublicEvent } from '@/lib/types';
import EventCard from '@/components/events/EventCard';
import type { Kind } from '@/lib/kind';
import Icon from '@/components/ui/Icon';

type Filter = 'all' | 'open' | 'soldout' | 'soon';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All events' }, { id: 'open', label: 'Open now' }, { id: 'soldout', label: 'Sold out' }, { id: 'soon', label: 'Opening soon' }];

// Search and filter run in the browser over the list the server already sent: instant, no extra requests.
// The search box in the hero tells this component what was typed through a small window event.
export default function EventExplorer({ events, photos = {} }: { events: PublicEvent[]; photos?: Partial<Record<Kind, string>> }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => {
    const on = (ev: Event) => setQ(String((ev as CustomEvent<string>).detail ?? ''));
    window.addEventListener('seatlock:search', on);
    return () => window.removeEventListener('seatlock:search', on);
  }, []);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (e: PublicEvent) => filter === 'all' || (filter === 'open' ? e.registration_state === 'OPEN' : filter === 'soldout' ? e.registration_state === 'SOLD_OUT' : e.registration_state === 'NOT_OPEN');
    return events.filter((e) => match(e) && (!needle || `${e.title} ${e.tagline} ${e.venue} ${e.host ?? ''}`.toLowerCase().includes(needle)));
  }, [events, q, filter]);

  return (
    <div>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-md">
          <label htmlFor="event-search" className="sr-only">Search events</label>
          <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input id="event-search" type="search" className="field !rounded-full !pl-11" placeholder="Search events or venues" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="no-scrollbar -mx-4 flex max-w-[100vw] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0" role="group" aria-label="Filter events">
          {FILTERS.map((f) => <button key={f.id} type="button" className="chip shrink-0" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-muted" aria-live="polite">{shown.length} event{shown.length === 1 ? '' : 's'}</p>
      {shown.length > 0 ? (
        <ul className="mt-8 grid gap-x-7 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e, i) => <li key={e.id} className="flex"><div className="flex w-full flex-col [&>a]:flex-1"><EventCard e={e} index={i} photos={photos} /></div></li>)}
        </ul>
      ) : (
        <div className="card mx-auto mt-8 grid max-w-xl place-items-center gap-2 px-6 py-14 text-center">
          <Icon name="search" size={28} className="text-muted" />
          <p className="display text-2xl">No events match</p>
          <p className="text-muted">Try a different word, or clear the filter.</p>
          <button className="btn btn-sm mt-2" onClick={() => { setQ(''); setFilter('all'); }}>Clear search</button>
        </div>
      )}
    </div>
  );
}

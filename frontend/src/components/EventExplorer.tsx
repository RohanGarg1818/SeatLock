'use client';
import { useMemo, useState } from 'react';
import type { PublicEvent } from '@/lib/types';
import EventCard from './EventCard';
import Icon from './Icon';

type Filter = 'all' | 'open' | 'soldout';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'open', label: 'Open now' }, { id: 'soldout', label: 'Sold out' }];

// Search and filter run in the browser over the list the server already sent: instant, no extra requests.
export default function EventExplorer({ events }: { events: PublicEvent[] }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) =>
      (filter === 'all' || (filter === 'open' ? e.registration_state === 'OPEN' : e.registration_state === 'SOLD_OUT')) &&
      (!needle || `${e.title} ${e.tagline} ${e.venue}`.toLowerCase().includes(needle)));
  }, [events, q, filter]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <label htmlFor="event-search" className="sr-only">Search events</label>
          <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input id="event-search" type="search" className="field !pl-10" placeholder="Search events or venues" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events">
          {FILTERS.map((f) => <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
      </div>
      <p className="mt-4 text-sm text-muted" aria-live="polite">{shown.length} event{shown.length === 1 ? '' : 's'}</p>
      {shown.length > 0 ? (
        <ul className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => <li key={e.id}><EventCard e={e} /></li>)}
        </ul>
      ) : (
        <div className="card mt-5 grid place-items-center gap-2 px-6 py-14 text-center">
          <Icon name="search" size={28} className="text-muted" />
          <p className="display text-2xl">No events match</p>
          <p className="text-muted">Try a different word, or clear the filter.</p>
          <button className="btn btn-sm mt-2" onClick={() => { setQ(''); setFilter('all'); }}>Clear search</button>
        </div>
      )}
    </div>
  );
}

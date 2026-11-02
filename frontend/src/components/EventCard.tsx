import Link from 'next/link';
import type { PublicEvent } from '@/lib/types';
import EventCover from './EventCover';
import { StateTag } from './StateTag';
import Icon from './Icon';
import { fmtDate, fmtTime, modeLabel } from '@/lib/format';

export default function EventCard({ e }: { e: PublicEvent }) {
  const taken = Math.max(0, e.capacity - e.seats_left);
  const pct = e.capacity ? Math.round((taken / e.capacity) * 100) : 0;
  const hot = e.registration_state === 'OPEN' && e.seats_left > 0 && pct >= 75;
  return (
    <Link href={`/e/${e.slug}`} className="card card-hover group flex h-full flex-col p-3">
      <EventCover title={e.title} startsAt={e.starts_at} slug={e.slug} bannerUrl={e.banner_url} compact />
      <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="display text-[1.45rem] leading-tight">{e.title}</h3>
          <StateTag state={e.registration_state} />
        </div>
        {e.tagline && <p className="mt-1.5 line-clamp-2 text-[0.95rem] text-muted">{e.tagline}</p>}
        <ul className="mt-4 space-y-1.5 text-sm text-muted">
          <li className="flex items-center gap-2"><Icon name="calendar" size={16} />{fmtDate(e.starts_at)} · {fmtTime(e.starts_at)}</li>
          <li className="flex items-center gap-2"><Icon name="pin" size={16} />{e.venue} · {modeLabel[e.mode]}</li>
        </ul>
        <div className="mt-auto pt-5">
          {e.registration_state === 'OPEN' && (
            <>
              <div className="flex items-baseline justify-between text-sm">
                <span><b className="text-fg">{e.seats_left}</b> of {e.capacity} seats left</span>
                {hot && <span className="font-semibold text-warm">Filling fast</span>}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
                <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${Math.max(pct, 4)}%` }} />
              </div>
            </>
          )}
          {e.registration_state === 'SOLD_OUT' && <p className="text-sm text-muted">Sold out · join the waitlist on the event page</p>}
          {e.registration_state === 'NOT_OPEN' && <p className="text-sm text-muted">Registration opens {fmtDate(e.registration_opens_at)}</p>}
          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-accent-text">View event <Icon name="arrow" size={16} className="transition-transform group-hover:translate-x-1" /></p>
        </div>
      </div>
    </Link>
  );
}

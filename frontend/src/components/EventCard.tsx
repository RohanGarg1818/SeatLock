import Link from 'next/link';
import type { PublicEvent } from '@/lib/types';
import { StateTag } from './StateTag';
import { dayNum, fmtTime, monthShort, modeLabel } from '@/lib/format';

// One event = one ticket: a dark stub with the date, a paper body with what you need to decide, and a row of squares that is the real seat count.
export default function EventCard({ e }: { e: PublicEvent }) {
  const open = e.registration_state === 'OPEN';
  const squares = Math.min(20, e.capacity);
  const free = e.capacity ? Math.round((e.seats_left / e.capacity) * squares) : 0;
  return (
    <Link href={`/e/${e.slug}`} className="ticket ticket-hover group h-full">
      <div className="ticket-stub text-center">
        <span className="display num text-4xl leading-none">{dayNum(e.starts_at)}</span>
        <span className="mt-1 text-sm font-semibold">{monthShort(e.starts_at)}</span>
      </div>
      <div className="flex min-w-0 flex-col p-4 pl-5">
        <h3 className="display line-clamp-3 text-2xl" title={e.title}>{e.title}</h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.95rem] text-muted"><StateTag state={e.registration_state} /><span>{fmtTime(e.starts_at)}, {e.venue} ({modeLabel[e.mode]})</span></p>
        {e.tagline && <p className="mt-2 line-clamp-2">{e.tagline}</p>}
        <div className="mt-auto pt-4">
          {open && (
            <>
              <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${e.seats_left} of ${e.capacity} seats free`}>
                {Array.from({ length: squares }, (_, i) => <span key={i} className={`seat ${i < free ? '' : 'seat-taken'}`} />)}
              </div>
              <p className="mt-2 text-[0.95rem]"><b className="num">{e.seats_left}</b> of <span className="num">{e.capacity}</span> seats free</p>
            </>
          )}
          {e.registration_state === 'SOLD_OUT' && <p className="text-[0.95rem] text-muted">Sold out. Join the waitlist on the event page.</p>}
          {e.registration_state === 'NOT_OPEN' && <p className="text-[0.95rem] text-muted">Registration opens {dayNum(e.registration_opens_at)} {monthShort(e.registration_opens_at)}.</p>}
        </div>
      </div>
    </Link>
  );
}

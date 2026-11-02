import Link from 'next/link';
import { dayNum, fmtTime, monthShort } from '@/lib/format';
import type { PublicEvent } from '@/lib/types';

const weekday = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });

// The first screen of the site: what it is, one way in, and the real next event printed on a ticket.
// With no open event it says so plainly instead of inventing one.
export default function TicketHero({ event, open, seats }: { event: PublicEvent | null; open: number; seats: number }) {
  const squares = event ? Math.min(24, event.capacity) : 0;
  const free = event && event.capacity ? Math.round((event.seats_left / event.capacity) * squares) : 0;
  return (
    <section className="grid items-center gap-10 pb-10 pt-4 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pb-14 lg:pt-10" aria-labelledby="hero-h">
      <div>
        <h1 id="hero-h" className="display text-[2.9rem] sm:text-7xl lg:text-[5.25rem]">Pick an event.<br />Keep your seat.</h1>
        <p className="mt-5 max-w-[46ch] text-lg sm:text-xl">Every talk, workshop and hackathon your societies run, in one place. Hold a seat, get a QR ticket, walk in. A seat is never given to two people.</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/#events" className="btn btn-primary btn-lg">Browse events</Link>
          <Link href="/organizer/signup" className="btn btn-lg">Run an event</Link>
        </div>
        {open > 0 && (
          <p className="mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <span><b className="display num text-4xl">{open}</b> <span className="text-muted">event{open === 1 ? '' : 's'} open</span></span>
            <span><b className="display num text-4xl">{seats}</b> <span className="text-muted">seats free right now</span></span>
          </p>
        )}
      </div>

      <div className="pass reveal mx-auto w-full max-w-md rotate-[1.5deg] p-7 sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">{event ? 'Next up' : 'Boarding soon'}</p>
        {event ? (
          <>
            <h2 className="display mt-2 line-clamp-3 text-3xl sm:text-4xl">{event.title}</h2>
            <p className="num mt-5 text-2xl leading-snug">{weekday(event.starts_at)} {dayNum(event.starts_at)} {monthShort(event.starts_at)}, {fmtTime(event.starts_at)}</p>
            <p className="text-xl">{event.venue}</p>
            <div className="mt-6 flex flex-wrap gap-[3px]" role="img" aria-label={`${event.seats_left} of ${event.capacity} seats free`}>
              {Array.from({ length: squares }, (_, i) => <span key={i} className={`seat ${i < free ? '' : 'seat-taken'}`} />)}
            </div>
            <p className="mt-2 text-sm"><b className="num">{event.seats_left}</b> of <span className="num">{event.capacity}</span> seats free</p>
            <Link href={`/e/${event.slug}`} className="btn btn-primary btn-lg mt-7 w-full">Hold a seat</Link>
          </>
        ) : (
          <>
            <h2 className="display mt-2 text-3xl sm:text-4xl">No event is open right now</h2>
            <p className="mt-4 text-lg text-muted">Organizers publish theirs on the organizer portal; it shows up here the moment registration opens.</p>
            <Link href="/organizer/signup" className="btn btn-primary btn-lg mt-7 w-full">Publish an event</Link>
          </>
        )}
      </div>
    </section>
  );
}

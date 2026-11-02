import Link from 'next/link';
import { SeatPlan } from './Pictures';
import { dayNum, fmtTime, monthShort } from '@/lib/format';
import type { PublicEvent } from '@/lib/types';

const weekday = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });

// The first screen is a ticket lying on a dark hall. Its facts are the real next event (live from the API);
// with no open event it says so plainly instead of inventing one.
export default function TicketHero({ event }: { event: PublicEvent | null }) {
  const squares = event ? Math.min(30, event.capacity) : 0;
  const free = event && event.capacity ? Math.round((event.seats_left / event.capacity) * squares) : 0;
  return (
    <section className="bleed -mt-8 bg-[#2b2622]" aria-labelledby="hero-h">
      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl items-center px-4 py-10 sm:px-6">
        <SeatPlan className="pointer-events-none absolute inset-x-0 top-1/2 w-full -translate-y-1/2 opacity-30" label="" />
        <div className="pass relative mx-auto w-full max-w-4xl p-6 sm:p-10">
          <h1 id="hero-h" className="display flex flex-wrap justify-between gap-x-6 text-[2.6rem] sm:text-6xl lg:text-7xl">
            <span>Every</span><span>seat,</span><span>once.</span>
          </h1>
          <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_1fr]">
            <div className="text-2xl leading-tight sm:text-3xl">
              {event ? (
                <>
                  <p className="num">{weekday(event.starts_at)} {dayNum(event.starts_at)} {monthShort(event.starts_at)}</p>
                  <p className="num">{fmtTime(event.starts_at)}</p>
                  <p>{event.venue}</p>
                  <p className="mt-3 text-lg text-muted">{event.title}</p>
                </>
              ) : (
                <>
                  <p>No event is open right now.</p>
                  <p className="mt-3 text-lg text-muted">Organizers publish theirs on the organizer portal; it shows up here the moment registration opens.</p>
                </>
              )}
            </div>
            <div className="max-w-[30ch]">
              <p className="text-lg">Event registration for college societies. Hold a seat, get a QR ticket, walk in. A seat is never given to two people.</p>
              {event && (
                <div className="mt-5">
                  <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${event.seats_left} of ${event.capacity} seats free`}>
                    {Array.from({ length: squares }, (_, i) => <span key={i} className={`seat ${i < free ? '' : 'seat-taken'}`} />)}
                  </div>
                  <p className="mt-2 text-sm"><b className="num">{event.seats_left}</b> of <span className="num">{event.capacity}</span> seats free</p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href={event ? `/e/${event.slug}` : '/#events'} className="btn btn-primary btn-lg">{event ? 'Hold a seat' : 'See all events'}</Link>
            <Link href="/#events" className="btn btn-lg">Browse every event</Link>
            <Link href="/organizer/signup" className="px-2 text-center underline underline-offset-4 sm:text-right">Run an event</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

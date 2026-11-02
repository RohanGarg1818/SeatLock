import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverFetch, getUser } from '@/lib/server';
import type { Booking } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import CancelBooking from '@/components/events/BookingActions';

export const metadata = { title: 'My tickets' };

export default async function MyBookings() {
  const user = await getUser();
  if (!user) redirect('/login?next=/me');
  const { data } = await serverFetch<{ bookings: Booking[] }>('/me/bookings');
  const bookings = data?.bookings ?? [];
  const wl = await serverFetch<{ waitlist: { event_id: string; event_title: string; event_slug: string; event_starts_at: string; event_venue: string; position: number }[] }>('/me/waitlist');
  const waiting = wl.data?.waitlist ?? [];
  const label = { HELD: 'Seat held: finish registering', CONFIRMED: 'Registered', CANCELLED: 'Cancelled', EXPIRED: 'Expired' } as const;
  return (
    <>
      <h1 className="display mt-1 text-4xl sm:text-5xl">My registrations</h1>
      {waiting.length > 0 && (
        <section className="mt-6" aria-labelledby="wl-h">
          <h2 id="wl-h" className="display text-2xl">On a waitlist</h2>
          <ul className="mt-3 space-y-3">
            {waiting.map((w) => (
              <li key={w.event_id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div><Link className="display text-xl hover:underline underline-offset-4" href={`/e/${w.event_slug}`}>{w.event_title}</Link><p className="text-sm text-muted">{fmtDateTime(w.event_starts_at)} · {w.event_venue}</p></div>
                <span className="tag">#{w.position} in line</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {bookings.length === 0 && waiting.length === 0 && <p className="mt-6 text-muted">You have not registered for anything yet. <Link className="font-semibold text-accent-text underline underline-offset-4" href="/">Browse events</Link>.</p>}
      <ul className="mt-6 space-y-4">
        {bookings.map((b) => (
          <li key={b.id} className="card card-hover p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="display text-2xl"><Link className="hover:underline underline-offset-4" href={`/e/${b.event_slug}`}>{b.event_title}</Link></h2>
                <p className="text-muted">{b.event_starts_at && fmtDateTime(b.event_starts_at)} · {b.event_venue}</p>
              </div>
              <span className={`tag ${b.status === 'CONFIRMED' ? 'border-ok text-ok' : b.status === 'HELD' ? 'border-accent text-accent-text' : 'text-muted'}`}>{label[b.status]}</span>
            </div>
            {b.checked_in_at && <p className="mt-2 text-ok">Checked in {fmtDateTime(b.checked_in_at)}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              {b.status === 'CONFIRMED' && <Link className="btn btn-sm btn-primary" href={`/me/tickets/${b.id}`}>View ticket</Link>}
              {b.status === 'HELD' && <Link className="btn btn-sm btn-primary" href={`/e/${b.event_slug}`}>Continue</Link>}
              {(b.status === 'CONFIRMED' || b.status === 'HELD') && !b.checked_in_at && <CancelBooking bookingId={b.id} />}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

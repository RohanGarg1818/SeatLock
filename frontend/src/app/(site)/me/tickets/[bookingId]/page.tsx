import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser, serverFetch } from '@/lib/server';
import type { Booking } from '@/lib/types';
import { fmtDate, fmtTime } from '@/lib/format';
import QrTicket from '@/components/QrTicket';

export const metadata = { title: 'Your ticket' };

export default async function Ticket({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/me/tickets/${bookingId}`)}`);
  const b = await serverFetch<{ booking: Booking }>(`/bookings/${encodeURIComponent(bookingId)}`);
  if (b.status !== 200 || !b.data) notFound();
  const booking = b.data.booking;
  const t = booking.status === 'CONFIRMED' ? await serverFetch<{ token: string }>(`/bookings/${encodeURIComponent(bookingId)}/ticket`) : null;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="display mt-2 text-4xl">{booking.event_title}</h1>
      <p className="mt-2 text-muted">{booking.event_starts_at && `${fmtDate(booking.event_starts_at)}, ${fmtTime(booking.event_starts_at)}`} · {booking.event_venue}</p>
      <p className="mt-1 font-medium">{user.name}</p>

      {t?.data ? (
        <div className="mt-6">
          {booking.checked_in_at && <p role="status" className="mb-4 card border-ok p-3 text-ok">Checked in at {fmtTime(booking.checked_in_at)}. This ticket has been used.</p>}
          <QrTicket token={t.data.token} />
          <p className="hint mt-3 text-center">Turn your screen brightness up and show this to the volunteer at the gate. It works once.</p>
        </div>
      ) : (
        <p className="card mt-6 p-4" role="status">
          {booking.status === 'HELD' ? 'This registration is not confirmed yet. ' : `This booking is ${booking.status.toLowerCase()}. `}
          <Link className="font-semibold text-accent-text underline underline-offset-4" href={`/e/${booking.event_slug}`}>Go to the event page</Link>.
        </p>
      )}
    </div>
  );
}

import Link from 'next/link';
import { getUser, serverFetch } from '@/lib/server';
import type { StaffEvent } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import Icon from '@/components/ui/Icon';

export const metadata = { title: 'Gate scanner' };

// For volunteers: the events an organizer has added you to. Organizers manage events in their own portal.
export default async function VolunteerHome() {
  const user = (await getUser())!;
  const staff = await serverFetch<{ events: StaffEvent[] }>('/me/staff-events');
  const staffEvents = staff.data?.events ?? [];
  return (
    <>
      <h1 className="display mt-1 text-4xl sm:text-5xl">Hi, {user.name.split(' ')[0]}</h1>
      <section className="mt-8" aria-labelledby="vol">
        <h2 id="vol" className="display text-3xl">Events you scan for</h2>
        {staffEvents.length === 0 && (
          <div className="card mt-4 p-6">
            <p className="text-muted">You are not a volunteer for any event yet. An organizer can add you by the email you signed up with.</p>
            <p className="mt-3 text-sm text-muted">Running an event yourself? <Link className="underline underline-offset-4" href="/organizer/signup">Use the organizer portal</Link>.</p>
          </div>
        )}
        <ul className="mt-4 space-y-3">
          {staffEvents.map((e) => (
            <li key={e.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="display text-xl">{e.title}</p><p className="text-sm text-muted">{fmtDateTime(e.starts_at)} · {e.venue}</p></div>
              <Link className="btn btn-sm btn-primary" href={`/dashboard/events/${e.id}/checkin`}><Icon name="scan" size={16} />Open scanner</Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

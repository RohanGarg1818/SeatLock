import Link from 'next/link';
import { getUser, serverFetch } from '@/lib/server';
import type { OrganizerEvent, StaffEvent } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import Icon from '@/components/Icon';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard() {
  const user = (await getUser())!;
  const isOrg = user.role === 'organizer' || user.role === 'admin';
  const [mine, staff, cfg] = await Promise.all([
    isOrg ? serverFetch<{ events: OrganizerEvent[] }>('/events') : Promise.resolve({ data: null }),
    serverFetch<{ events: StaffEvent[] }>('/me/staff-events'),
    serverFetch<{ demo_enabled: boolean }>('/config'),
  ]);
  const events = mine.data?.events ?? [];
  const staffEvents = staff.data?.events ?? [];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{isOrg ? 'Organizer' : 'Volunteer'}</p>
          <h1 className="display mt-1 text-4xl sm:text-5xl">Welcome, {user.name.split(' ')[0]}</h1>
        </div>
        {isOrg && (
          <div className="flex gap-3">
            {cfg.data?.demo_enabled && <Link className="btn" href="/dashboard/demo">Race demo</Link>}
            <Link className="btn btn-primary" href="/dashboard/events/new">New event</Link>
          </div>
        )}
      </div>

      {isOrg && events.length > 0 && (
        <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ['Events', events.length],
            ['Registered', events.reduce((n, e) => n + (e.confirmed_count ?? 0), 0)],
            ['Seats on hold', events.reduce((n, e) => n + (e.held_count ?? 0), 0)],
            ['Checked in', events.reduce((n, e) => n + (e.checked_in_count ?? 0), 0)],
          ].map(([k, v]) => <div key={k} className="card px-5 py-4"><dt className="eyebrow">{k}</dt><dd className="display mt-1 text-3xl">{v}</dd></div>)}
        </dl>
      )}

      {isOrg && (
        <section className="mt-8" aria-labelledby="mine">
          <h2 id="mine" className="display text-3xl">Your events</h2>
          {events.length === 0 && <p className="mt-3 text-muted">No events yet. Create your first one.</p>}
          <ul className="mt-4 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="card card-hover flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <Link href={`/dashboard/events/${e.id}`} className="display text-xl hover:underline underline-offset-4">{e.title}</Link>
                  <p className="text-sm text-muted">{fmtDateTime(e.starts_at)} · {e.venue}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <span className="tag">{e.status}</span>
                  <span>{e.confirmed_count ?? 0} registered · {e.held_count ?? 0} held · {e.capacity} seats</span>
                  <span className="text-muted">{e.checked_in_count ?? 0} checked in</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="vol">
        <h2 id="vol" className="display text-3xl">Events you scan for</h2>
        {staffEvents.length === 0 && <p className="mt-3 text-muted">You are not a volunteer for any event. An organizer can add you by email.</p>}
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

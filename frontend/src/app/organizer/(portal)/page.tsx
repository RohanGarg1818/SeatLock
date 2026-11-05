import Link from 'next/link';
import { getOrganizer, serverFetch } from '@/lib/server';
import type { OrganizerEvent } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import Icon from '@/components/ui/Icon';
import Snapshot from '@/components/ui/Snapshot';
import { kindOf, posterFor } from '@/lib/kind';

export const metadata = { title: 'My events' };

export default async function OrganizerHome() {
  const user = (await getOrganizer())!;
  const admin = user.role === 'admin';
  // An admin sees and manages every organizer's events; an organizer sees their own.
  const { data } = await serverFetch<{ events: OrganizerEvent[] }>(admin ? '/events?all=true' : '/events');
  const events = data?.events ?? [];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl sm:text-6xl">{admin ? 'All events' : user.organization ?? 'Your events'}</h1>
          <p className="mt-2 text-lg text-muted">Welcome, {user.name.split(' ')[0]}{admin && ', you can manage every event on the platform'}</p>
        </div>
        <Link className="btn btn-primary" href="/organizer/events/new"><Icon name="plus" size={16} />New event</Link>
      </div>

      {events.length > 0 && (
        <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ['Events', events.length],
            ['Registered', events.reduce((n, e) => n + (e.confirmed_count ?? 0), 0)],
            ['Seats on hold', events.reduce((n, e) => n + (e.held_count ?? 0), 0)],
            ['Checked in', events.reduce((n, e) => n + (e.checked_in_count ?? 0), 0)],
          ].map(([k, v]) => <div key={k} className="card px-5 py-4"><dt className="text-sm text-muted">{k}</dt><dd className="display mt-1 text-3xl">{v}</dd></div>)}
        </dl>
      )}

      <section className="mt-8" aria-labelledby="mine">
        <h2 id="mine" className="display text-3xl">Your events</h2>
        {events.length === 0 && (
          <div className="card mt-4 p-8 text-center">
            <p className="display text-2xl">No events yet</p>
            <p className="mx-auto mt-2 max-w-md text-muted">Create a draft, set the seats and the registration form, then publish when you are ready. Nobody sees it until you do.</p>
            <Link className="btn btn-primary btn-lg mt-6" href="/organizer/events/new">Create your first event</Link>
          </div>
        )}
        <ul className="mt-4 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="card card-hover flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="flex min-w-0 items-center gap-4">
                <span className="hidden w-24 shrink-0 sm:block"><Snapshot src={posterFor(e)} kind={kindOf(e.title)} alt="" className="!rounded-2xl" /></span>
                <div className="min-w-0">
                  <Link href={`/organizer/events/${e.id}`} className="display text-xl underline-offset-4 hover:underline">{e.title}</Link>
                  <p className="text-sm text-muted">{fmtDateTime(e.starts_at)} · {e.venue}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="tag">{e.status}</span>
                <span>{e.confirmed_count ?? 0} registered · {e.held_count ?? 0} held · {e.capacity} seats</span>
                <span className="text-muted">{e.checked_in_count ?? 0} checked in</span>
                <Link className="btn btn-sm" href={`/organizer/events/${e.id}`}>Manage</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

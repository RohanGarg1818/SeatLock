import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser, serverFetch } from '@/lib/server';
import type { EventStats, OrganizerEvent } from '@/lib/types';
import EventManager from '@/components/EventManager';

export const metadata = { title: 'Manage event' };

export default async function ManageEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (user?.role !== 'organizer' && user?.role !== 'admin') redirect('/dashboard');
  const [ev, st] = await Promise.all([
    serverFetch<{ event: OrganizerEvent }>(`/events/${id}`),
    serverFetch<{ stats: EventStats }>(`/events/${id}/stats`),
  ]);
  if (ev.status !== 200 || !ev.data || !st.data) notFound(); // also what a non-owner sees: the API answers 404
  return (
    <>
      <p><Link href="/dashboard" className="text-sm underline underline-offset-4">← Dashboard</Link></p>
      <EventManager initialEvent={ev.data.event} initialStats={st.data.stats} />
    </>
  );
}

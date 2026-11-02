import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser, serverFetch } from '@/lib/server';
import type { OrganizerEvent, StaffEvent } from '@/lib/types';
import Scanner from '@/components/Scanner';

export const metadata = { title: 'Check-in scanner' };

export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getUser())!;
  // Organizers/admins open it via the event; volunteers via the list of events they are staff for.
  // The API re-checks on every scan: this lookup only decides which title to show.
  let title: string | null = null;
  if (user.role === 'organizer' || user.role === 'admin') {
    const r = await serverFetch<{ event: OrganizerEvent }>(`/events/${id}`);
    if (r.status === 200 && r.data) title = r.data.event.title;
  }
  if (!title) {
    const r = await serverFetch<{ events: StaffEvent[] }>('/me/staff-events');
    title = r.data?.events.find((e) => e.id === id)?.title ?? null;
  }
  if (!title) redirect('/dashboard');
  return (
    <>
      <p><Link href="/dashboard" className="text-sm underline underline-offset-4">← Dashboard</Link></p>
      <h1 className="display mt-2 text-4xl">Check-in</h1>
      <div className="mt-4"><Scanner eventId={id} eventTitle={title} /></div>
    </>
  );
}

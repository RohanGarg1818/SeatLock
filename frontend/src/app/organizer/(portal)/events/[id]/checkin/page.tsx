import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/server';
import type { OrganizerEvent } from '@/lib/types';
import Scanner from '@/components/organizer/Scanner';

export const metadata = { title: 'Check-in scanner' };

export default async function OrganizerCheckin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await serverFetch<{ event: OrganizerEvent }>(`/events/${id}`);
  if (r.status !== 200 || !r.data) notFound(); // the API only returns events this organizer owns (or any, for an admin)
  return (
    <>
      <p><Link href={`/organizer/events/${id}`} className="text-sm underline underline-offset-4">← {r.data.event.title}</Link></p>
      <h1 className="display mt-2 text-4xl">Check-in</h1>
      <div className="mt-4"><Scanner eventId={id} eventTitle={r.data.event.title} /></div>
    </>
  );
}

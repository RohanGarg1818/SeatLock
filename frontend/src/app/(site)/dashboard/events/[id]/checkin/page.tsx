import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverFetch } from '@/lib/server';
import type { StaffEvent } from '@/lib/types';
import Scanner from '@/components/Scanner';

export const metadata = { title: 'Check-in scanner' };

// Volunteers scan here. (Organizers scan from their own portal, under /organizer.)
// The API re-checks on every scan: this lookup only decides which title to show.
export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await serverFetch<{ events: StaffEvent[] }>('/me/staff-events');
  const title = r.data?.events.find((e) => e.id === id)?.title ?? null;
  if (!title) redirect('/dashboard');
  return (
    <>
      <p><Link href="/dashboard" className="text-sm underline underline-offset-4">← Gate scanner</Link></p>
      <h1 className="display mt-2 text-4xl">Check-in</h1>
      <div className="mt-4"><Scanner eventId={id} eventTitle={title} /></div>
    </>
  );
}

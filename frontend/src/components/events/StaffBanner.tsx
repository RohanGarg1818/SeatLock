'use client';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import Icon from '@/components/ui/Icon';

// The event page is cached and the same for everyone, so "you are a volunteer here" is decided in the browser.
export default function StaffBanner({ eventId }: { eventId: string }) {
  const { staff } = useSession();
  if (!staff.some((s) => s.id === eventId)) return null;
  return (
    <div className="card mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="display text-2xl">You are a volunteer for this event</p><p className="text-muted">Scan tickets with your camera and see who has registered.</p></div>
      <Link href={`/dashboard/events/${eventId}`} className="btn btn-primary shrink-0"><Icon name="scan" size={16} />Open volunteer desk</Link>
    </div>
  );
}

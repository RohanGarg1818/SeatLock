import Link from 'next/link';
import StaffDesk from '@/components/organizer/StaffDesk';

export const metadata = { title: 'Volunteer desk' };

// Volunteer desk for one event. The page itself holds no data: StaffDesk calls /staff/events/:id/*, and the API
// answers "not found" to anyone who is not the organizer, an admin or a volunteer of this event.
export default async function Desk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <p><Link href="/dashboard" className="text-sm underline underline-offset-4">← Your events</Link></p>
      <div className="mt-3"><StaffDesk eventId={id} /></div>
    </>
  );
}

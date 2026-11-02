import Link from 'next/link';
import EventForm from '@/components/organizer/EventForm';

export const metadata = { title: 'New event' };

export default function NewEvent() {
  return (
    <>
      <p><Link href="/organizer" className="text-sm underline underline-offset-4">← My events</Link></p>
      <h1 className="display text-4xl">New event</h1>
      <p className="mt-2 text-muted">It starts as a draft. Nobody can see or register until you publish.</p>
      <div className="mt-8 max-w-2xl"><EventForm /></div>
    </>
  );
}

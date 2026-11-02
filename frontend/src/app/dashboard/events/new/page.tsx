import { redirect } from 'next/navigation';
import { getUser } from '@/lib/server';
import EventForm from '@/components/EventForm';

export const metadata = { title: 'New event' };

export default async function NewEvent() {
  const user = await getUser();
  if (user?.role !== 'organizer' && user?.role !== 'admin') redirect('/dashboard');
  return (
    <>
      <h1 className="display text-4xl">New event</h1>
      <p className="mt-2 text-muted">It starts as a draft. Nobody can see or register until you publish.</p>
      <div className="mt-8 max-w-2xl"><EventForm /></div>
    </>
  );
}

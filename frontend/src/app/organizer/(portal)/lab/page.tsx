import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/server';
import RaceDemo from '@/components/organizer/RaceDemo';
import ChaosLab from '@/components/organizer/ChaosLab';

export const metadata = { title: 'Race demo' };

export default async function DemoPage() {
  const cfg = await serverFetch<{ demo_enabled: boolean }>('/config');
  if (!cfg.data?.demo_enabled) notFound(); // the API does not even mount the demo routes unless ENABLE_DEMO=true
  return (
    <>
      <p><Link href="/organizer" className="text-sm underline underline-offset-4">← My events</Link></p>
      <h1 className="display mt-2 text-4xl">The overselling race</h1>
      <p className="mt-2 max-w-2xl text-muted">Many people ask for the last seats at the same instant. The naive version reads the count, then writes it back, so two requests can both read &quot;1 left&quot;. The SeatLock version checks and decrements in a single statement. Both run against a throwaway event that is deleted afterwards.</p>
      <div className="mt-8"><RaceDemo /></div>
      <h2 className="display mt-16 text-3xl">Chaos Lab</h2>
      <p className="mt-2 max-w-2xl text-muted">Now make it harder. Send a crowd at a throwaway event while breaking things on purpose: double clicks, a dead cache, cancellations, expiring holds. Afterwards an independent checker re-derives every seat number from the raw bookings and tells you whether the rules still held.</p>
      <div className="mt-8"><ChaosLab /></div>
    </>
  );
}

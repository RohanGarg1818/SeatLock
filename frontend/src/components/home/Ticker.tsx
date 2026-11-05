import Link from 'next/link';
import type { PublicEvent } from '@/lib/types';
import Snapshot from '@/components/ui/Snapshot';
import { kindOf, posterFor } from '@/lib/kind';

// The logo strip under the hero: every event as a small poster and its name, scrolling slowly. Pauses on hover and for people who
// prefer reduced motion. The list is repeated so the loop has no gap; the copy is hidden from screen readers.
export default function Ticker({ events }: { events: PublicEvent[] }) {
  const items = events.filter((e) => e.registration_state !== 'CANCELLED');
  if (items.length === 0) return null;
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-12 pr-12" aria-hidden={hidden || undefined}>
      {items.map((e) => (
        <li key={e.id}>
          <Link href={`/e/${e.slug}`} tabIndex={hidden ? -1 : undefined} className="flex items-center gap-3 whitespace-nowrap opacity-80 transition-opacity hover:opacity-100">
            <span className="h-10 w-10"><Snapshot src={posterFor(e)} kind={kindOf(e.title)} ratio="aspect-square" className="!rounded-full" /></span>
            <span className="display text-2xl">{e.title.split(':')[0]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="bleed overflow-hidden py-6" aria-label="Events on SeatLock">
      <div className="marquee flex w-max">{row(false)}{row(true)}</div>
    </div>
  );
}

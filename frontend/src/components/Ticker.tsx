import Link from 'next/link';
import { dayNum, monthShort } from '@/lib/format';
import type { PublicEvent } from '@/lib/types';

// A departures-board strip: every open event with its live seat count, scrolling slowly. Pauses on hover and
// for people who prefer reduced motion. The list is repeated so the loop has no gap; the copy is hidden from screen readers.
export default function Ticker({ events }: { events: PublicEvent[] }) {
  const items = events.filter((e) => e.registration_state === 'OPEN');
  if (items.length === 0) return null;
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {items.map((e) => (
        <li key={e.id}>
          <Link href={`/e/${e.slug}`} tabIndex={hidden ? -1 : undefined} className="flex items-baseline gap-3 whitespace-nowrap">
            <span className="num font-semibold">{dayNum(e.starts_at)} {monthShort(e.starts_at)}</span>
            <span className="display text-xl">{e.title}</span>
            <span className="num text-sm opacity-80">{e.seats_left} seats left</span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="bleed overflow-hidden bg-[#2b2622] py-3 text-[#f6f2f0]" aria-label="Open events">
      <div className="marquee flex w-max">{row(false)}{row(true)}</div>
    </div>
  );
}

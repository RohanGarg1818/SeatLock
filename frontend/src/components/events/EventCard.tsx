import Link from 'next/link';
import type { PublicEvent } from '@/lib/types';
import Snapshot from '@/components/ui/Snapshot';
import Icon, { Burst } from '@/components/ui/Icon';
import { kindOf, posterFor, type Kind } from '@/lib/kind';
import { dayNum, fmtTime, monthShort, modeLabel } from '@/lib/format';

// One event = one offer card, like a Product Pass offer: the event photo on top, its name, a line about it, and a tan
// footer with the live number of free seats in big slanted letters. A yellow seal says when something is up (almost gone, sold out).
export default function EventCard({ e, photos = {} }: { e: PublicEvent; index?: number; photos?: Partial<Record<Kind, string>> }) {
  const kind = kindOf(e.title);
  const src = posterFor(e) ?? photos[kind] ?? null;
  const st = e.registration_state;
  const low = st === 'OPEN' && e.seats_left <= Math.max(3, Math.ceil(e.capacity * 0.1));
  const seal = st === 'SOLD_OUT' ? 'Sold out' : low ? 'Almost gone' : st === 'NOT_OPEN' ? 'Opens soon' : null;
  const foot =
    st === 'OPEN' ? { big: `${e.seats_left} seats left`, cta: 'Register' }
    : st === 'SOLD_OUT' ? { big: 'Waitlist open', cta: 'Join' }
    : st === 'NOT_OPEN' ? { big: `Opens ${dayNum(e.registration_opens_at)} ${monthShort(e.registration_opens_at)}`, cta: 'Details' }
    : { big: st === 'CANCELLED' ? 'Cancelled' : 'Closed', cta: 'View' };
  return (
    <Link href={`/e/${e.slug}`} className="offer group pb-3" aria-label={`${e.title}: ${foot.big}`}>
      {seal && <Burst className="-right-3 -top-6" rotate={st === 'SOLD_OUT' ? -12 : 14} color={st === 'SOLD_OUT' ? '#f6a9b8' : '#f4c542'}>{seal}</Burst>}
      <div className="offer-body">
        <div className="p-3 pb-0"><Snapshot src={src} kind={kind} alt={`Poster for ${e.title}`} className="!rounded-[22px]" /></div>
        <div className="flex-1 px-6 pb-6 pt-5">
          <h3 className="display text-[1.45rem] leading-tight" title={e.title}>{e.title}</h3>
          {e.tagline && <p className="mt-2 line-clamp-2 text-[0.97rem] text-muted">{e.tagline}</p>}
          <ul className="mt-4 space-y-1.5 text-[0.92rem] font-medium">
            <li className="flex items-center gap-2"><Icon name="calendar" size={16} className="shrink-0" /><span>{dayNum(e.starts_at)} {monthShort(e.starts_at)}, {fmtTime(e.starts_at)}</span></li>
            <li className="flex items-center gap-2"><Icon name="pin" size={16} className="shrink-0" /><span className="truncate">{e.venue.split(' (')[0]} <span className="font-normal text-muted">({modeLabel[e.mode]})</span></span></li>
            {e.allowed_email_domains?.length ? <li className="flex items-center gap-2"><Icon name="shield" size={16} className="shrink-0" /><span>College email only</span></li> : null}
          </ul>
        </div>
        <div className="offer-foot">
          <span className="value num whitespace-nowrap text-[1.3rem] leading-none">{foot.big}</span>
          <span className="inline-flex items-center gap-1 font-bold">{foot.cta} <Icon name="arrow" size={16} className="transition-transform group-hover:translate-x-1" /></span>
        </div>
      </div>
    </Link>
  );
}

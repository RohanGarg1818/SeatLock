import type { PublicEvent } from '@/lib/types';
import HeroSearch from '@/components/home/HeroSearch';
import Snapshot from '@/components/ui/Snapshot';
import { Logo } from '@/components/ui/Icon';
import { kindOf, posterFor } from '@/lib/kind';

// First screen, after the Product Pass page: a big friendly headline and a search pill on the left; on the right two
// event passes hanging on orange lanyards. The back pass is a grid of real event posters, so the hero is the programme.
export default function TicketHero({ events, open, seats }: { events: PublicEvent[]; open: number; seats: number }) {
  const tiles = events.filter((e) => posterFor(e)).slice(0, 9);
  return (
    <section className="grid items-center gap-6 pb-6 pt-8 lg:grid-cols-[1.05fr_1fr] lg:pt-12" aria-labelledby="hero-h">
      <div className="pb-4">
        <h1 id="hero-h" className="display text-[2.6rem] leading-[1.02] sm:text-[3.6rem] lg:text-[4.1rem]">
          Hold your seat at every campus event<span className="text-accent-text"> (never oversold!)</span>
        </h1>
        <p className="mt-6 max-w-[48ch] text-lg text-muted">
          SeatLock is where college societies publish hackathons, workshops and talks. Hold a seat while you register, get a signed QR ticket,
          and walk in. New events arrive all term, and a seat is never given to two people.
        </p>
        <div className="mt-8"><HeroSearch /></div>
        <p className="mt-3 max-w-md text-center text-sm font-medium text-muted">
          {open > 0 ? <>{open} event{open === 1 ? '' : 's'} open · {seats} seats free right now. Seats are limited, hold yours!</> : 'Seats are limited: hold yours as soon as an event opens.'}
        </p>
      </div>

      <div className="relative mx-auto h-[440px] w-full max-w-[440px] sm:h-[520px] sm:max-w-[560px]" aria-hidden="true">
        {/* lanyards */}
        <div className="absolute left-[24%] top-[-40px] h-28 w-10 -rotate-[8deg] bg-accent [border-inline:2px_solid_#141414] sm:left-[28%]" />
        <div className="absolute right-[26%] top-[-40px] h-24 w-10 rotate-[10deg] bg-accent [border-inline:2px_solid_#141414]" />
        {/* back pass: poster grid */}
        <div className="sway badge-card right-0 top-[44px] w-[52%] -rotate-0 p-3 sm:top-[40px]" style={{ ['--r0' as string]: '8deg', ['--r1' as string]: '5deg' }}>
          <div className="mx-auto mb-2 h-3 w-12 rounded-full border-2 border-ink-line bg-bg" />
          <div className="grid grid-cols-3 gap-2">
            {(tiles.length ? tiles : events.slice(0, 9)).slice(0, 9).map((e) => (
              <span key={e.id} className="aspect-square overflow-hidden rounded-xl border-2 border-ink-line bg-white">
                <Snapshot src={posterFor(e)} kind={kindOf(e.title)} ratio="aspect-square" className="!rounded-none !border-0" />
              </span>
            ))}
          </div>
        </div>
        {/* front pass */}
        <div className="sway badge-card left-0 top-[64px] w-[52%] p-5 text-center sm:top-[70px]" style={{ ['--r0' as string]: '-7deg', ['--r1' as string]: '-3deg' }}>
          <div className="mx-auto mb-4 h-3.5 w-14 rounded-full border-2 border-ink-line bg-bg" />
          <p className="display text-sm italic">SeatLock&apos;s</p>
          <div className="my-2 flex justify-center"><Logo size={84} /></div>
          <p className="display text-[2.4rem] leading-[0.88] tracking-tight sm:text-[3.2rem]">SEAT<br />PASS</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-widest">one seat · one scan</p>
        </div>
      </div>
    </section>
  );
}

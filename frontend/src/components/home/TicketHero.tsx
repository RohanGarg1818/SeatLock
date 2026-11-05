import type { PublicEvent } from '@/lib/types';
import HeroSearch from '@/components/home/HeroSearch';
import Snapshot from '@/components/ui/Snapshot';
import { Logo } from '@/components/ui/Icon';
import { kindOf, posterFor } from '@/lib/kind';

// A metal swivel clip: the little hook that joins a lanyard to its badge.
function Clip() {
  return (
    <svg width="58" height="78" viewBox="0 0 58 78" className="relative z-10 -my-3" aria-hidden="true">
      <defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e9d3b8" /><stop offset=".5" stopColor="#b8916f" /><stop offset="1" stopColor="#8d6a4c" /></linearGradient></defs>
      <path d="M14 4h30l8 30H6z" fill="#c9a07a" stroke="#141414" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M23 10h12l3 18H20z" fill="#f2d9bf" opacity=".7" />
      <rect x="22" y="30" width="14" height="30" rx="4" fill="url(#metal)" stroke="#141414" strokeWidth="2.6" />
      <rect x="12" y="56" width="34" height="14" rx="7" fill="url(#metal)" stroke="#141414" strokeWidth="2.6" />
    </svg>
  );
}

// First screen, after the Product Pass page: a big friendly headline and a search pill on the left; on the right two
// event passes hanging on orange lanyards that run up behind the frosted header. The back pass is a grid of event posters.
export default function TicketHero({ events, open, seats }: { events: PublicEvent[]; open: number; seats: number }) {
  const withPoster = events.filter((e) => posterFor(e));
  const pool = withPoster.length ? withPoster : events;
  const tiles = Array.from({ length: 12 }, (_, i) => (pool.length ? pool[i % pool.length] : null));
  const next = events.filter((e) => e.registration_state === 'OPEN').sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
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

      <div className="relative mx-auto h-[430px] w-full max-w-[420px] sm:h-[560px] sm:max-w-[560px]" aria-hidden="true">
        {/* back pass: a grid of event posters, like the app tiles on the reference */}
        <div className="sway absolute right-0 top-[20px] flex w-[47%] flex-col items-center sm:top-[-210px]" style={{ ['--r0' as string]: '7deg', ['--r1' as string]: '4deg' }}>
          <div className="strap h-16 w-9 sm:h-80 sm:w-11" />
          <Clip />
          <div className="id-card -mt-2 w-full bg-[#ebb07f] p-3 pt-5">
            <div className="mx-auto mb-3 h-3 w-14 rounded-full border-2 border-ink-line bg-bg" />
            <div className="grid grid-cols-3 gap-2">
              {tiles.map((e, i) => (
                <div key={i} className="aspect-square overflow-hidden rounded-[14px] border-2 border-ink-line bg-white">
                  {e ? <Snapshot src={posterFor(e)} kind={kindOf(e.title)} ratio="aspect-square" className="!rounded-none !border-0" /> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* front pass */}
        <div className="sway absolute left-0 top-[40px] flex w-[52%] flex-col items-center sm:top-[-190px]" style={{ ['--r0' as string]: '-6deg', ['--r1' as string]: '-2deg' }}>
          <div className="strap h-16 w-9 sm:h-80 sm:w-11" />
          <Clip />
          <div className="id-card -mt-2 w-full bg-[#f6d6b8] px-4 pb-6 pt-5 text-center">
            <div className="mx-auto mb-4 h-3.5 w-14 rounded-full border-2 border-ink-line bg-bg" />
            <p className="display text-sm italic">SeatLock&apos;s</p>
            <div className="my-2 flex justify-center drop-shadow-[0_4px_0_rgba(20,20,20,.15)]"><Logo size={92} /></div>
            <p className="display text-[2.5rem] leading-[0.88] tracking-tight sm:text-[3.4rem]">SEAT<br />PASS</p>
            <p className="mt-3 text-[0.7rem] font-extrabold uppercase tracking-[0.2em]">one seat · one scan</p>
          </div>
        </div>
        {/* frosted notice floating over the passes */}
        {next && (
          <div className="glass absolute bottom-2 right-1 z-20 flex items-center gap-3 rounded-3xl px-4 py-3 sm:bottom-6" style={{ transform: 'rotate(-2deg)' }}>
            <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink-line bg-accent"><span className="value text-lg leading-none">{next.seats_left}</span></span>
            <span className="text-left leading-tight"><span className="block text-xs font-bold uppercase tracking-wide text-muted">Next up</span><span className="block max-w-[11rem] truncate text-sm font-extrabold">{next.title.split(':')[0]}</span></span>
          </div>
        )}
      </div>
    </section>
  );
}

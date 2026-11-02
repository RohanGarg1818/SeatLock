import Link from 'next/link';
import { publicFetch } from '@/lib/server';
import type { PublicEvent } from '@/lib/types';
import EventExplorer from '@/components/events/EventExplorer';
import TicketHero from '@/components/home/TicketHero';
import Ticker from '@/components/home/Ticker';
import Proof from '@/components/home/Proof';
import Faq from '@/components/ui/Faq';
import { HoldTimer, Queue, SeatPlan, TicketArt } from '@/components/ui/Pictures';

// Each sheet slides up over the one before it. Fills come from the page's palette, ink chosen per sheet.
const SHEETS = [
  { name: 'Never oversold', text: 'Checking and taking a seat happen in one database step. Two people can never get the last seat, however many click at once.', bg: 'bg-[#d6cecb] text-[#2b2622]', art: <SeatPlan className="w-full" /> },
  { name: 'Timed holds', text: 'A seat is held while you fill in the form. If you walk away, the timer runs out and the seat goes back to the pool.', bg: 'bg-[#2b2622] text-[#f6f2f0]', art: <HoldTimer className="mx-auto w-full max-w-xs" /> },
  { name: 'A waitlist that runs itself', text: 'When a seat frees up, the first person in line is given it, in order, with nobody refreshing the page.', bg: 'bg-[#0f7d45] text-white', art: <Queue className="w-full max-w-lg" /> },
  { name: 'Signed QR tickets', text: 'Every ticket carries a signature. Edited, copied or forged codes are rejected at the gate, and a real one works exactly once.', bg: 'bg-[#5f5753] text-[#f6f2f0]', art: <TicketArt className="w-full max-w-md" /> },
];

const SLIP: { when: string; rows: [string, string][] }[] = [
  { when: 'Before the event', rows: [['Find an event and open it', '1 min'], ['Hold a seat', '5:00 timer'], ['Answer the registration questions', '1 min'], ['Confirm, and the QR ticket appears', 'instant']] },
  { when: 'On the day', rows: [['Show the QR ticket at the gate', '2 sec'], ['A volunteer scans it on a phone', '2 sec']] },
];

export default async function Home() {
  const { status, data } = await publicFetch<{ events: PublicEvent[] }>('/public/events', 20);
  const events = data?.events ?? [];
  const ok = status === 200;
  const soonest = events.filter((e) => e.registration_state === 'OPEN').sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;

  const openEvents = events.filter((e) => e.registration_state === 'OPEN');
  const seatsFree = openEvents.reduce((n, e) => n + e.seats_left, 0);

  return (
    <>
      <TicketHero event={soonest} open={openEvents.length} seats={seatsFree} />
      <Ticker events={events} />

      {/* events */}
      <section id="events" className="scroll-mt-24 pt-16 sm:pt-20" aria-labelledby="events-h">
        <h2 id="events-h" className="display reveal text-5xl sm:text-6xl">Upcoming events</h2>
        <p className="reveal mt-4 max-w-[60ch] text-lg">Pick one, hold your seat, and you are done. Seat counts update live.</p>
        <div className="mt-10">
          {!ok && (
            <div role="alert" className="card flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="display text-3xl">Events did not load</p>
                <p className="mt-1 text-muted">The server may be waking up after a quiet spell. Try again in a few seconds.</p>
                {process.env.NODE_ENV !== 'production' && <p className="hint mt-2">Developer note: the website could not reach the backend. Start it with <code>npm run dev</code> (from the project root) and check http://localhost:4000/health.</p>}
              </div>
              <Link href="/" className="btn btn-primary shrink-0">Try again</Link>
            </div>
          )}
          {ok && events.length === 0 && (
            <div className="card px-6 py-14">
              <p className="display text-4xl">No events yet</p>
              <p className="mt-2 max-w-md text-muted">Nothing is open for registration right now. If you run a society, you can publish the first event.</p>
              <Link href="/organizer/signup" className="btn btn-primary mt-6">Publish an event</Link>
            </div>
          )}
          {ok && events.length > 0 && <EventExplorer events={events} />}
        </div>
      </section>

      {/* features: four colour panels, side by side */}
      <section id="features" className="scroll-mt-24 pt-20 sm:pt-28" aria-labelledby="feat-h">
        <h2 id="feat-h" className="display reveal text-5xl sm:text-6xl">What keeps it fair</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {SHEETS.map((s) => (
            <article key={s.name} className={`reveal flex flex-col justify-between gap-6 rounded-[4px] p-6 sm:p-8 ${s.bg}`}>
              <div className="flex h-44 items-center justify-center [&>svg]:!h-full [&>svg]:!w-auto [&>svg]:!max-w-full">{s.art}</div>
              <div>
                <h3 className="display text-3xl">{s.name}</h3>
                <p className="mt-2 max-w-[46ch] text-lg">{s.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Proof />

      {/* how it works: an itinerary on a slip */}
      <section id="how" className="scroll-mt-24 pt-20 sm:pt-28" aria-labelledby="how-h">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_30rem] lg:gap-20">
          <div>
            <h2 id="how-h" className="display reveal text-5xl sm:text-6xl">From click to front row</h2>
            <p className="reveal mt-5 max-w-[34ch] text-lg">The whole journey takes about eight minutes, and most of it is you reading the registration form.</p>
          </div>
          <div className="slip reveal px-6 pt-6">
            {SLIP.map((g) => (
              <div key={g.when} className="mt-6 first:mt-0">
                <h3 className="text-xl font-semibold">{g.when}</h3>
                <ol className="mt-2 space-y-2">
                  {g.rows.map(([what, t]) => (
                    <li key={what} className="flex items-end gap-2"><span>{what}</span><span className="leader" aria-hidden /><span className="num">{t}</span></li>
                  ))}
                </ol>
              </div>
            ))}
            <p className="-mx-6 mt-6 flex items-center justify-between bg-[#2b2622] px-6 py-3 text-[#f6f2f0]"><span>One QR ticket, one entry</span><span className="num">about 8 min</span></p>
          </div>
        </div>
      </section>

      {/* organizers: the reply card */}
      <section className="bleed mt-24 overflow-hidden bg-[#2b2622] sm:mt-32" aria-labelledby="org-h">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.2fr]">
          <p className="reveal max-w-[34ch] self-center text-xl text-[#f6f2f0]">Publish an event in a few minutes, share one link, and watch the seats fill. Holds, the waitlist, tickets and check-in are handled for you.</p>
          <div className="reveal rotate-[-2deg] bg-[#f6f2f0] p-8 text-center text-[#2b2622] sm:p-12">
            <h2 id="org-h" className="display text-3xl sm:text-4xl">Run your society&apos;s next event</h2>
            <p className="mx-auto mt-3 max-w-xs text-[1.05rem]">Free to start. Your own login and your own dashboard.</p>
            <Link href="/organizer/signup" className="btn btn-primary btn-lg mt-6 w-full">Open the organizer portal</Link>
            <Link href="/organizer/login" className="mt-4 inline-block underline underline-offset-4">I already have an organizer account</Link>
          </div>
        </div>
        <div className="h-0" aria-hidden />
      </section>

      {/* faq */}
      <section id="faq" className="scroll-mt-24 pt-24 sm:pt-32" aria-labelledby="faq-h">
        <h2 id="faq-h" className="display reveal mb-10 text-5xl sm:text-6xl">Good to know</h2>
        <Faq />
      </section>
    </>
  );
}

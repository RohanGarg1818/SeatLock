import Link from 'next/link';
import { publicFetch } from '@/lib/server';
import type { PublicEvent } from '@/lib/types';
import EventExplorer from '@/components/events/EventExplorer';
import TicketHero from '@/components/home/TicketHero';
import Ticker from '@/components/home/Ticker';
import Proof from '@/components/home/Proof';
import { photoMap } from '@/lib/photos';
import Faq from '@/components/ui/Faq';
import Icon, { Burst } from '@/components/ui/Icon';
import { HoldTimer, Queue, SeatPlan, TicketArt } from '@/components/ui/Pictures';

// The four promises, as offer-style cards: a coloured picture panel on top, the name and a line below.
const FEATURES = [
  { name: 'Never oversold', text: 'Checking and taking a seat happen in one database step. Two people can never get the last seat, however many click at once.', bg: '#fdd4b6', art: <SeatPlan className="w-full" /> },
  { name: 'Timed holds', text: 'A seat is held while you fill in the form. If you walk away, the timer runs out and the seat goes back to the pool.', bg: '#f4c542', art: <HoldTimer className="mx-auto w-full max-w-xs" /> },
  { name: 'A waitlist that runs itself', text: 'When a seat frees up, the first person in line is given it, in order, with nobody refreshing the page.', bg: '#c5dba8', art: <Queue className="w-full max-w-lg" /> },
  { name: 'Signed QR tickets', text: 'Every ticket carries a signature. Edited, copied or forged codes are rejected at the gate, and a real one works exactly once.', bg: '#e8883a', art: <TicketArt className="w-full max-w-md" /> },
];

const ATTENDEE = ['Hold a seat while you fill in the registration form', 'A signed QR ticket on your phone the moment you confirm', 'Automatic waitlist when an event fills up', 'One account for every society’s events'];
const ORGANIZER = ['Publish events with your own registration questions', 'Live seats, waitlist and one-click CSV export', 'Add volunteers who scan tickets at the gate', 'Raise capacity, cancel or close any time'];

export default async function Home() {
  const { status, data } = await publicFetch<{ events: PublicEvent[] }>('/public/events', 20);
  const events = data?.events ?? [];
  const ok = status === 200;
  const openEvents = events.filter((e) => e.registration_state === 'OPEN');
  const seatsFree = openEvents.reduce((n, e) => n + e.seats_left, 0);

  return (
    <>
      <TicketHero events={events} open={openEvents.length} seats={seatsFree} />
      <Ticker events={events} />

      {/* events */}
      <section id="events" className="scroll-mt-28 pt-12 sm:pt-16" aria-labelledby="events-h">
        <h2 id="events-h" className="display text-center text-4xl sm:text-6xl">Events open for registration</h2>
        <p className="mx-auto mt-4 max-w-[52ch] text-center text-lg text-muted">Every upcoming hackathon, workshop and talk from the societies on campus. Pick one, hold your seat, done.</p>
        <div className="mt-10">
          {!ok && (
            <div role="alert" className="card mx-auto flex max-w-3xl flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="display text-2xl">Events did not load</p>
                <p className="mt-1 text-muted">The server may be waking up after a quiet spell. Try again in a few seconds.</p>
                {process.env.NODE_ENV !== 'production' && <p className="hint mt-2">Developer note: the website could not reach the backend. Start it with <code>npm run dev</code> (from the project root) and check http://localhost:4000/health.</p>}
              </div>
              <Link href="/" className="btn btn-primary shrink-0">Try again</Link>
            </div>
          )}
          {ok && events.length === 0 && (
            <div className="card mx-auto max-w-2xl px-6 py-14 text-center">
              <p className="display text-3xl">No events yet</p>
              <p className="mx-auto mt-2 max-w-md text-muted">Nothing is open for registration right now. If you run a society, you can publish the first event.</p>
              <Link href="/organizer/signup" className="btn btn-primary mt-6">Publish an event</Link>
            </div>
          )}
          {ok && events.length > 0 && <EventExplorer events={events} photos={photoMap()} />}
        </div>

        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="display text-2xl sm:text-3xl">Want your own event here?</p>
          <Link href="/organizer/signup" className="btn btn-primary btn-lg">Run an event <Icon name="arrow" size={18} /></Link>
        </div>
      </section>

      {/* pricing / tiers */}
      <section id="pricing" className="scroll-mt-28 pt-24 sm:pt-32" aria-labelledby="pricing-h">
        <h2 id="pricing-h" className="display text-center text-4xl sm:text-6xl">Free for students. Free for societies.</h2>
        <p className="mt-6 flex items-center justify-center gap-3 text-center text-lg font-extrabold uppercase tracking-wide">
          <Icon name="flame" size={26} className="text-accent" /> One platform, three ways in <Icon name="flame" size={26} className="text-accent" />
        </p>
        <div className="mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-2">
          <article className="tier" style={{ background: '#fdd4b6' }}>
            <h3 className="display text-3xl">Attendee</h3>
            <p className="mt-3 flex items-baseline gap-2"><span className="display text-6xl">Free</span><span className="text-lg">/ always</span></p>
            <ul className="mt-8">
              {ATTENDEE.map((t) => <li key={t}><Icon name="check" size={20} className="mt-0.5 shrink-0" /><span>{t}</span></li>)}
            </ul>
            <Link href="/register" className="btn btn-primary btn-lg mt-auto w-full !mt-8">Get your pass</Link>
          </article>
          <article className="tier relative" style={{ background: '#e9ae70' }}>
            <Burst className="-right-5 -top-9 !h-28 !w-28 !text-base" rotate={14}>Best for<br />societies</Burst>
            <h3 className="display text-3xl">Organizer</h3>
            <p className="mt-3 flex items-baseline gap-2"><span className="display text-6xl">Free</span><span className="text-lg">/ to start</span></p>
            <p className="mt-8 flex items-center gap-2 text-sm font-medium">Everything in Attendee, plus <Icon name="arrow" size={16} className="rotate-90" /></p>
            <ul className="mt-2">
              {ORGANIZER.map((t) => <li key={t}><Icon name="check" size={20} className="mt-0.5 shrink-0" /><span>{t}</span></li>)}
            </ul>
            <Link href="/organizer/signup" className="btn btn-primary btn-lg w-full !mt-8">Become an organizer</Link>
          </article>
        </div>
        <div className="mx-auto mt-8 flex max-w-5xl flex-col items-center justify-between gap-5 rounded-[28px] border-2 border-ink-line bg-card p-6 text-card-fg sm:flex-row sm:p-8">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-ink-line bg-yellow text-[#141414]"><Icon name="scan" size={28} /></span>
            <div><p className="display text-2xl">Volunteer gate desk</p><p className="text-muted">Camera scanner, search and manual check-in. Included with every event, no extra plan.</p></div>
          </div>
          <Link href="/dashboard" className="btn shrink-0">Open the gate scanner</Link>
        </div>
      </section>

      {/* features */}
      <section id="features" className="scroll-mt-28 pt-24 sm:pt-32" aria-labelledby="feat-h">
        <h2 id="feat-h" className="display text-center text-4xl sm:text-6xl">What keeps it fair</h2>
        <div className="mx-auto mt-14 grid max-w-5xl gap-x-8 gap-y-14 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.name} className="offer pb-3">
              <div className="offer-body">
                <div className="flex h-52 items-center justify-center border-b-[3px] border-dotted border-[#141414] p-6 [&>svg]:!h-full [&>svg]:!w-auto [&>svg]:!max-w-full" style={{ background: f.bg }}>{f.art}</div>
                <div className="px-6 pb-7 pt-5">
                  <h3 className="display text-2xl">{f.name}</h3>
                  <p className="mt-2 text-muted">{f.text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Proof />

      {/* faq */}
      <section id="faq" className="scroll-mt-28 pt-24 sm:pt-32" aria-labelledby="faq-h">
        <h2 id="faq-h" className="display mb-10 text-center text-4xl sm:text-6xl">Questions?</h2>
        <Faq />
        <p className="mt-8 text-center text-muted">Still stuck? Ask your society&apos;s organizer, or write to the volunteers at the gate.</p>
      </section>

      {/* closing call to action */}
      <section className="pt-24 text-center sm:pt-32" aria-labelledby="cta-h">
        <h2 id="cta-h" className="display mx-auto max-w-[18ch] text-4xl sm:text-6xl">Fill every seat, exactly once</h2>
        <p className="mx-auto mt-5 max-w-[52ch] text-lg text-muted">Find an event, hold your seat, and walk in with a ticket nobody can forge. Or publish your own in a few minutes.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/#events" className="btn btn-primary btn-lg">Browse events <Icon name="arrow" size={18} /></Link>
          <Link href="/organizer/signup" className="btn btn-lg">Run an event</Link>
        </div>
      </section>
    </>
  );
}

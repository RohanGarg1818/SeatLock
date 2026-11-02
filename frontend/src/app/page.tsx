import Link from 'next/link';
import { getUser, serverFetch } from '@/lib/server';
import type { PublicEvent } from '@/lib/types';
import EventExplorer from '@/components/EventExplorer';
import SeatMapHero from '@/components/SeatMapHero';
import Faq from '@/components/Faq';
import Icon from '@/components/Icon';
import { dayNum, monthShort } from '@/lib/format';

const STEPS = [
  { icon: 'search', title: 'Find your event', text: 'Browse what your societies are running, or open the link a friend sent you. Every event shows how many seats are really left.' },
  { icon: 'clock', title: 'Hold your seat', text: 'Click Register and the seat is yours for a few minutes while you fill in the form. No one else can take it from under you.' },
  { icon: 'scan', title: 'Scan and walk in', text: 'Your QR ticket is ready the moment you confirm. A volunteer scans it at the gate, and it works exactly once.' },
];

const FEATURES = [
  { icon: 'shield', title: 'Never oversold', text: 'Checking and taking a seat happen in one database step. Two people can never get the last seat.' },
  { icon: 'clock', title: 'Timed holds', text: 'A seat is held while you register. If you walk away, it goes back to the pool automatically.' },
  { icon: 'list', title: 'Self-running waitlist', text: 'When a seat frees up, the first person in line gets it, instantly and in order.' },
  { icon: 'ticket', title: 'Signed QR tickets', text: 'Every ticket carries a signature. Edited, copied or forged codes are rejected at the gate.' },
  { icon: 'scan', title: 'Phone-ready scanner', text: 'Volunteers scan with a phone browser, or just verify a ticket without checking anyone in.' },
  { icon: 'chart', title: 'Organizer dashboard', text: 'Live seat counts, a registrations table, CSV export, team access and a full activity log.' },
] as const;

export default async function Home() {
  const [{ status, data }, user] = await Promise.all([serverFetch<{ events: PublicEvent[] }>('/public/events'), getUser()]);
  const events = data?.events ?? [];
  const ok = status === 200;
  const open = events.filter((e) => e.registration_state === 'OPEN');
  const seatsLeft = open.reduce((n, e) => n + e.seats_left, 0);
  const next = events.map((e) => e.starts_at).sort()[0];
  const isOrganizer = user?.role === 'organizer' || user?.role === 'admin';

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <section className="bleed -mt-8 overflow-hidden border-b border-line mesh">
        <div className="grid-dots absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,#000,transparent_85%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28 lg:pt-24">
          <div className="rise">
            <p className="tag mb-6 !bg-surface/80 backdrop-blur"><Icon name="bolt" size={14} className="text-warm" />Built so seats are never double-booked</p>
            <h1 className="display text-[2.9rem] sm:text-6xl lg:text-[4.6rem]">
              Every seat, handed out <span className="text-gradient">exactly once.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted sm:text-xl">
              Registration for college events that stays fair when the whole campus clicks at the same second. Hold a seat, get a QR ticket, walk in.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/#events" className="btn btn-primary btn-lg">Browse events <Icon name="arrow" /></Link>
              {isOrganizer
                ? <Link href="/dashboard/events/new" className="btn btn-lg">Create an event</Link>
                : <Link href={user ? '/me' : '/register'} className="btn btn-lg">{user ? 'My tickets' : 'Create a free account'}</Link>}
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {['Free to register', 'QR ticket in seconds', 'Works on any phone'].map((t) => <li key={t} className="flex items-center gap-2"><Icon name="check" size={16} className="text-ok" />{t}</li>)}
            </ul>
          </div>
          <div className="rise pb-8 lg:pb-0" style={{ animationDelay: '.15s' }}><SeatMapHero /></div>
        </div>
      </section>

      {/* ------------------------------------------------------------- live numbers (real, from the API) */}
      {ok && events.length > 0 && (
        <section aria-label="Right now" className="relative z-10 -mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { k: String(open.length), l: open.length === 1 ? 'event open for registration' : 'events open for registration' },
            { k: seatsLeft.toLocaleString('en-IN'), l: 'seats still free across them' },
            { k: next ? `${dayNum(next)} ${monthShort(next)}` : '—', l: 'is when the next event starts' },
          ].map((s) => (
            <div key={s.l} className="card flex items-center gap-4 px-6 py-5">
              <p className="display text-3xl sm:text-4xl">{s.k}</p>
              <p className="text-sm leading-snug text-muted">{s.l}</p>
            </div>
          ))}
        </section>
      )}

      {/* ------------------------------------------------------------- events */}
      <section id="events" className="scroll-mt-24 pt-20 sm:pt-24" aria-labelledby="events-h">
        <p className="eyebrow">What&apos;s on</p>
        <h2 id="events-h" className="display mt-2 text-4xl sm:text-5xl">Upcoming events</h2>
        <p className="mt-3 max-w-xl text-muted">Pick one, hold your seat, and you are done. Seat counts update live.</p>
        <div className="mt-8">
          {!ok && (
            <div role="alert" className="card flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="display text-2xl">We can&apos;t load events right now</p>
                <p className="mt-1 text-muted">This is usually brief. Please try again in a moment.</p>
                {process.env.NODE_ENV !== 'production' && <p className="hint mt-2">Developer note: the website could not reach the backend. Start it with <code>npm run dev</code> (from the project root) and check http://localhost:4000/health.</p>}
              </div>
              <Link href="/" className="btn btn-primary shrink-0">Try again</Link>
            </div>
          )}
          {ok && events.length === 0 && (
            <div className="card grid place-items-center gap-2 px-6 py-16 text-center">
              <Icon name="calendar" size={30} className="text-muted" />
              <p className="display text-2xl">No upcoming events yet</p>
              <p className="text-muted">Check back soon, or run one yourself.</p>
              <Link href={user ? '/dashboard/events/new' : '/register'} className="btn btn-primary mt-3">{isOrganizer ? 'Create an event' : 'Get started'}</Link>
            </div>
          )}
          {ok && events.length > 0 && <EventExplorer events={events} />}
        </div>
      </section>

      {/* ------------------------------------------------------------- how it works */}
      <section id="how" className="scroll-mt-24 pt-24 sm:pt-32" aria-labelledby="how-h">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 id="how-h" className="display mt-2 text-4xl sm:text-5xl">From click to front row in three steps</h2>
        </div>
        <ol className="relative mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card relative p-7">
              <span className="absolute right-6 top-5 display text-6xl text-surface-2 [-webkit-text-stroke:1px_var(--line)]" aria-hidden>{i + 1}</span>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-ink shadow-[0_10px_22px_-10px_var(--accent)]"><Icon name={s.icon} size={22} /></span>
              <h3 className="display mt-6 text-2xl">{s.title}</h3>
              <p className="mt-2 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------- features */}
      <section id="features" className="scroll-mt-24 pt-24 sm:pt-32" aria-labelledby="feat-h">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Why SeatLock</p>
          <h2 id="feat-h" className="display mt-2 text-4xl sm:text-5xl">Fair for students, easy for organizers</h2>
          <p className="mt-4 text-muted">Everything an event needs, from the first click to the gate.</p>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="card card-hover p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-accent-text ring-1 ring-line"><Icon name={f.icon} /></span>
              <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-muted">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------------- organizer call to action */}
      <section className="pt-24 sm:pt-32" aria-labelledby="org-h">
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 px-6 py-14 text-center text-white shadow-[var(--shadow-lg)] sm:px-14 sm:py-20">
          <div className="absolute inset-0 -z-10 opacity-30" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.6) 1px, transparent 1.5px)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(70% 90% at 50% 0%, #000, transparent)' }} />
          <div className="absolute -bottom-24 left-1/2 -z-10 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-orange-400/30 blur-3xl" />
          <h2 id="org-h" className="display mx-auto max-w-2xl text-4xl sm:text-5xl">Running an event for your society?</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">Publish it in a few minutes, share one link, and watch the seats fill. We handle holds, the waitlist, tickets and check-in.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={isOrganizer ? '/dashboard/events/new' : '/register'} className="btn btn-lg !border-transparent !bg-white !text-slate-900">{isOrganizer ? 'Create an event' : 'Create your account'}<Icon name="arrow" /></Link>
            <Link href="/#features" className="btn btn-lg !border-white/40 !bg-white/10 !text-white backdrop-blur">See what you get</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- faq */}
      <section id="faq" className="scroll-mt-24 pt-24 sm:pt-32" aria-labelledby="faq-h">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="eyebrow">Questions</p>
          <h2 id="faq-h" className="display mt-2 text-4xl sm:text-5xl">Good to know</h2>
        </div>
        <Faq />
      </section>
    </>
  );
}

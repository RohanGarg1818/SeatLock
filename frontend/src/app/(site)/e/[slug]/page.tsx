import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { publicFetch } from '@/lib/server';
import type { MyBooking, PublicEvent } from '@/lib/types';
import Markdown from '@/components/ui/Markdown';
import RegisterPanel from '@/components/events/RegisterPanel';
import StaffBanner from '@/components/events/StaffBanner';
import ShareBar from '@/components/ui/ShareBar';
import Icon, { Burst } from '@/components/ui/Icon';
import Snapshot from '@/components/ui/Snapshot';
import { kindOf, photoSrc } from '@/lib/photos';
import { posterFor } from '@/lib/kind';
import { StateTag } from '@/components/ui/StateTag';
import { fmtDate, fmtTime, modeLabel } from '@/lib/format';

// React cache(): generateMetadata and the page both need the event, but it is fetched once per request.
const load = cache(async (slug: string) => publicFetch<{ event: PublicEvent; my_booking: MyBooking | null; my_waitlist: { position: number } | null }>(`/public/events/${encodeURIComponent(slug)}`, 10));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await load(slug);
  if (!data) return { title: 'Event not found' };
  const e = data.event;
  const description = `${fmtDate(e.starts_at)}, ${fmtTime(e.starts_at)} · ${e.venue}${e.tagline ? `. ${e.tagline}` : ''}`;
  // Link previews (WhatsApp, Slack, X) read these tags from the server-rendered HTML, which is why this is Next.js and not a client-only SPA.
  const image = e.banner_url ?? `/e/${e.slug}/og`;
  return {
    title: e.title,
    description,
    alternates: { canonical: `/e/${e.slug}` },
    openGraph: { type: 'website', title: e.title, description, url: `/e/${e.slug}`, siteName: 'SeatLock', images: [{ url: image, width: 1200, height: 630, alt: e.title }] },
    twitter: { card: 'summary_large_image', title: e.title, description, images: [image] },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { status, data } = await load(slug);
  if (status === 404 || (status === 200 && !data)) notFound();
  if (status !== 200 || !data) return <p role="alert" className="card p-4">We could not load this event. Please refresh in a moment.</p>;
  const { event: e, my_booking, my_waitlist } = data;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Event', name: e.title, startDate: e.starts_at, endDate: e.ends_at,
    eventStatus: e.status === 'CANCELLED' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    location: { '@type': 'Place', name: e.venue }, ...(e.host && { organizer: { '@type': 'Organization', name: e.host } }), description: e.tagline || undefined,
  };

  const sameDay = fmtDate(e.ends_at) === fmtDate(e.starts_at);
  const info = [
    { icon: 'calendar', k: 'When', v: fmtDate(e.starts_at), sub: `${fmtTime(e.starts_at)} – ${sameDay ? '' : `${fmtDate(e.ends_at)}, `}${fmtTime(e.ends_at)} IST` },
    { icon: 'pin', k: 'Where', v: e.venue, sub: modeLabel[e.mode] },
    { icon: 'users', k: 'Seats', v: `${e.capacity} in total`, sub: e.registration_state === 'OPEN' ? `${e.seats_left} still free` : e.registration_state === 'SOLD_OUT' ? 'Sold out' : '' },
  ];

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav aria-label="Breadcrumb" className="mb-6"><Link href="/#events" className="btn btn-sm"><Icon name="arrow" size={16} className="rotate-180" />All events</Link></nav>
      <StaffBanner eventId={e.id} />
      {/* On a phone the order is: poster and details, registration, description. On a laptop the registration card sits in a sticky right column. */}
      <div className="mt-6 grid gap-x-10 gap-y-10 pb-24 lg:grid-cols-[1fr_24rem] lg:pb-0">
        <div className="min-w-0 lg:col-start-1">
          <div className="relative">
            {e.registration_state === 'SOLD_OUT' && <Burst className="-right-2 -top-6 z-10" rotate={-12} color="#f6a9b8">Sold out</Burst>}
            {e.registration_state === 'OPEN' && e.seats_left <= Math.max(3, Math.ceil(e.capacity * 0.1)) && <Burst className="-right-2 -top-6 z-10" rotate={12}>Almost gone</Burst>}
            <Snapshot src={posterFor(e) ?? photoSrc(kindOf(e.title))} kind={kindOf(e.title)} alt={`Poster for ${e.title}`} ratio="aspect-[16/9]" className="!rounded-[32px]" priority />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2"><StateTag state={e.registration_state} /><span className="tag">{modeLabel[e.mode]}</span></div>
          {e.host && <p className="mt-5 text-lg font-bold text-accent-text">{e.host}</p>}
          <h1 className="display mt-1 text-4xl sm:text-6xl">{e.title}</h1>
          {e.tagline && <p className="mt-4 text-xl text-muted">{e.tagline}</p>}

          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            {info.map((i) => (
              <div key={i.k} className="card flex items-start gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink-line bg-surface-2 text-[#141414]"><Icon name={i.icon} size={18} /></span>
                <div className="min-w-0"><dt className="text-sm text-muted">{i.k}</dt><dd className="mt-0.5 font-bold leading-snug">{i.v}</dd>{i.sub && <dd className="text-sm text-muted">{i.sub}</dd>}</div>
              </div>
            ))}
          </dl>
        </div>

        <aside id="register" className="scroll-mt-28 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-28 lg:self-start">
          <RegisterPanel event={e} initialMyBooking={my_booking} initialWaitlist={my_waitlist} />
        </aside>

        <div className="min-w-0 lg:col-start-1">
          {e.description_md && <section aria-label="About this event"><Markdown source={e.description_md} /></section>}
          <div className="mt-10"><ShareBar title={e.title} slug={e.slug} /></div>
        </div>
      </div>

      {/* Phone: a bar pinned to the bottom so the action is always one tap away. */}
      {e.registration_state === 'OPEN' && !my_booking && (
        <div className="fixed inset-x-3 bottom-3 z-30 glass rounded-full px-5 py-2.5 lg:hidden">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <p className="text-sm leading-tight"><b className="value text-xl">{e.seats_left}</b><span className="text-muted"> seats left</span></p>
            <a href="#register" className="btn btn-primary btn-sm">Register</a>
          </div>
        </div>
      )}
    </article>
  );
}

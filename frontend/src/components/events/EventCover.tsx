import { dayNum, monthShort } from '@/lib/format';

function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

// Flat paper-and-ink fills, one per event (derived from the slug, so a card and its page agree). No gradients, no blur, no outline.
const FILLS = ['bg-[#2b2622] text-[#f6f2f0]', 'bg-[#0f7d45] text-white', 'bg-[#5f5753] text-[#f6f2f0]'];

// Decorative (aria-hidden): the page's <h1> carries the title. An event with a banner image uses the image instead.
export default function EventCover({ title, startsAt, slug, bannerUrl, compact = false }: { title: string; startsAt: string; slug: string; bannerUrl: string | null; compact?: boolean }) {
  const size = compact ? 'aspect-[16/10]' : 'aspect-[16/7] sm:aspect-[21/6]';
  if (bannerUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={bannerUrl} alt="" className={`w-full rounded-[4px] object-cover ${size}`} loading={compact ? 'lazy' : 'eager'} />;
  }
  return (
    <div aria-hidden="true" className={`flex items-end justify-between gap-6 overflow-hidden rounded-[4px] p-5 sm:p-8 ${FILLS[hash(slug) % FILLS.length]} ${size}`}>
      <p className="display line-clamp-2 max-w-[18ch] text-3xl sm:text-5xl">{title}</p>
      <div className="shrink-0 text-right leading-none">
        <div className="display num text-5xl sm:text-7xl">{dayNum(startsAt)}</div>
        <div className="mt-1 text-lg font-semibold sm:text-2xl">{monthShort(startsAt)}</div>
      </div>
    </div>
  );
}

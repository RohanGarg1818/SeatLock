import { dayNum, monthShort } from '@/lib/format';

function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

// Six gradient "posters". Each event always gets the same one (derived from its slug), so a card and its page match.
const PALETTES = [
  'from-indigo-700 to-violet-600', 'from-rose-700 to-orange-500', 'from-teal-700 to-emerald-500',
  'from-fuchsia-700 to-purple-600', 'from-blue-700 to-cyan-600', 'from-slate-800 to-indigo-600',
];

// Decorative (aria-hidden): the page's <h1> carries the title. An event with a banner image uses the image instead.
export default function EventCover({ title, startsAt, slug, bannerUrl, compact = false }: { title: string; startsAt: string; slug: string; bannerUrl: string | null; compact?: boolean }) {
  const radius = compact ? 'rounded-2xl' : 'rounded-3xl';
  if (bannerUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={bannerUrl} alt="" className={`w-full ${radius} object-cover shadow-[var(--shadow)] ${compact ? 'aspect-[16/10]' : 'aspect-[16/10] sm:aspect-[21/9]'}`} loading={compact ? 'lazy' : 'eager'} />;
  }
  const palette = PALETTES[hash(slug) % PALETTES.length];
  return (
    <div aria-hidden="true" className={`relative isolate overflow-hidden bg-gradient-to-br ${palette} text-white ${radius} ${compact ? 'aspect-[16/10] p-5' : 'aspect-[16/10] p-6 sm:aspect-[21/9] sm:p-10'}`}>
      <div className="absolute inset-0 -z-10 opacity-40" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.55) 1px, transparent 1.5px)', backgroundSize: '20px 20px', maskImage: 'linear-gradient(135deg, transparent 20%, #000 90%)' }} />
      <div className="absolute -right-10 -top-10 -z-10 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
      <div className="absolute -bottom-16 left-1/3 -z-10 h-40 w-40 rounded-full bg-black/20 blur-2xl" />
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className={`rounded-2xl bg-white/18 px-3.5 py-2 text-center leading-none backdrop-blur-md ring-1 ring-white/30 ${compact ? '' : 'sm:px-5 sm:py-3'}`}>
            <div className={`display ${compact ? 'text-3xl' : 'text-4xl sm:text-6xl'}`}>{dayNum(startsAt)}</div>
            <div className={`mt-1 font-bold tracking-[0.18em] ${compact ? 'text-[0.65rem]' : 'text-[0.7rem] sm:text-xs'}`}>{monthShort(startsAt)}</div>
          </div>
        </div>
        <div className={`display line-clamp-2 max-w-[22ch] drop-shadow-sm ${compact ? 'text-xl' : 'text-2xl sm:text-5xl'}`}>{title}</div>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { Logo } from '@/components/ui/Icon';

const LINKS: [string, string][] = [['Events', '/#events'], ['Pricing', '/#pricing'], ['FAQs', '/#faq'], ['My tickets', '/me'], ['Organizer portal', '/organizer/login'], ['Volunteer gate scanner', '/dashboard']];

export default function Footer() {
  return (
    <footer className="mt-24 px-3 pb-3 sm:px-6">
      <div className="mx-auto max-w-6xl glass rounded-[36px] px-6 py-10 sm:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="SeatLock home"><Logo size={38} /><span className="display text-[1.8rem] italic leading-none">SeatLock</span></Link>
            <p className="mt-3 max-w-sm text-[0.95rem] text-muted">Event registration for college societies. Every seat is handed out once, even when the whole campus clicks at the same second.</p>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 font-medium md:max-w-md md:justify-end">
            {LINKS.map(([label, href]) => <li key={label}><Link className="underline-offset-4 hover:underline" href={href}>{label}</Link></li>)}
          </ul>
        </div>
        <p className="mt-8 border-t-2 border-dotted border-[color-mix(in_srgb,var(--ink-line)_45%,transparent)] pt-5 text-sm text-muted">© {new Date().getFullYear()} SeatLock · Free to register, one seat per person · Times are shown in IST</p>
      </div>
    </footer>
  );
}

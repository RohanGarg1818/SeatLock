import Link from 'next/link';
import { Logo } from './Icon';

const cols = [
  { title: 'Explore', links: [['Upcoming events', '/#events'], ['How it works', '/#how'], ['Features', '/#features'], ['FAQ', '/#faq']] },
  { title: 'Your account', links: [['Log in', '/login'], ['Create an account', '/register'], ['My tickets', '/me']] },
  { title: 'For organizers', links: [['Create an event', '/dashboard/events/new'], ['Dashboard', '/dashboard'], ['Gate scanner', '/dashboard']] },
];

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5"><Logo /><span className="display text-2xl">SeatLock</span></div>
          <p className="mt-4 max-w-xs text-muted">Event registration for college societies, where every seat is handed out exactly once, even when the whole campus clicks at the same second.</p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="eyebrow">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([label, href]) => <li key={label}><Link className="text-[0.95rem] text-muted transition-colors hover:text-fg" href={href}>{label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} SeatLock. Free to register, always one seat per person.</p>
          <p>Times are shown in IST.</p>
        </div>
      </div>
    </footer>
  );
}

import Link from 'next/link';

// The back of the card: a paper panel with a scalloped top edge, a short message on the left, the addresses on the right.
const LINKS: [string, string][] = [['Upcoming events', '/#events'], ['Create an account', '/register'], ['My tickets', '/me'], ['Organizer portal', '/organizer/login'], ['Volunteer gate scanner', '/dashboard']];

export default function Footer() {
  return (
    <footer className="mt-24 bg-[#2b2622] pt-16">
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="scallop bg-[#f6f2f0] px-6 pb-8 pt-16 text-[#2b2622] sm:px-12">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="display text-4xl">SeatLock</p>
              <p className="mt-3 max-w-sm">Event registration for college societies. Every seat is handed out once, even when the whole campus clicks at the same second.</p>
            </div>
            <ul className="space-y-2.5 text-lg">
              {LINKS.map(([label, href]) => <li key={label}><Link className="underline-offset-4 hover:underline" href={href}>{label}</Link></li>)}
            </ul>
          </div>
          <p className="mt-10 text-center text-sm text-[#5f5753]">© {new Date().getFullYear()} SeatLock. Free to register, one seat per person. Times are shown in IST.</p>
        </div>
      </div>
    </footer>
  );
}

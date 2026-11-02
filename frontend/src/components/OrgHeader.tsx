import Link from 'next/link';
import { getOrganizer, serverFetch } from '@/lib/server';
import OrgNav from './OrgNav';
import { Logo } from './Icon';

// Header of the organizer portal. It is a different product surface from the attendee site: its own brand line,
// its own navigation, and it only ever shows the organizer session.
export default async function OrgHeader() {
  const [user, cfg] = await Promise.all([getOrganizer(), serverFetch<{ demo_enabled: boolean }>('/config')]);
  return (
    <header className="sticky top-0 z-40 bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/organizer" className="flex items-center gap-2.5" aria-label="Organizer portal home">
          <Logo />
          <span className="display text-[1.6rem] leading-none">SeatLock</span>
          <span className="tag">Organizer</span>
        </Link>
        <OrgNav user={user ? { name: user.name, organization: user.organization ?? null } : null} lab={!!cfg.data?.demo_enabled} />
      </div>
    </header>
  );
}

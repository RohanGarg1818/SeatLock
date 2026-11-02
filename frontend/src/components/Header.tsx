import Link from 'next/link';
import { getUser, serverFetch } from '@/lib/server';
import NavMenu from './NavMenu';
import { Logo } from './Icon';

// Server component: asks the API who is logged in, then hands plain data to the client-side menu.
export default async function Header() {
  // Both calls start together (not one after the other); the second one just answers 401 for a logged-out visitor.
  const [user, staff] = await Promise.all([getUser(), serverFetch<{ events: unknown[] }>('/me/staff-events')]);
  const volunteers = !!user && (staff.data?.events?.length ?? 0) > 0;
  // The blur lives on its own background layer: a backdrop-filter on the header itself would trap the fixed phone menu inside the header's 64px.
  return (
    <header className="sticky top-0 z-40 bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SeatLock home">
          <Logo />
          <span className="display text-[1.7rem] leading-none">SeatLock</span>
        </Link>
        <NavMenu user={user ? { name: user.name, role: user.role } : null} volunteers={volunteers} />
      </div>
    </header>
  );
}

import Link from 'next/link';
import { getUser } from '@/lib/server';
import NavMenu from './NavMenu';
import { Logo } from './Icon';

// Server component: asks the API who is logged in, then hands plain data to the client-side menu.
export default async function Header() {
  const user = await getUser();
  // The blur lives on its own background layer: a backdrop-filter on the header itself would trap the fixed phone menu inside the header's 64px.
  return (
    <header className="sticky top-0 z-40 isolate border-b border-line">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SeatLock home">
          <Logo />
          <span className="display text-[1.6rem] leading-none">SeatLock</span>
        </Link>
        <NavMenu user={user ? { name: user.name, role: user.role } : null} />
      </div>
    </header>
  );
}

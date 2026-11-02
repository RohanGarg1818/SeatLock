import Link from 'next/link';
import NavMenu from './NavMenu';
import { Logo } from './Icon';

// No data fetching here any more: the menu asks the browser-side session hook who is logged in,
// so every page that uses this header can be cached and served instantly.
export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SeatLock home">
          <Logo />
          <span className="display text-[1.7rem] leading-none">SeatLock</span>
        </Link>
        <NavMenu />
      </div>
    </header>
  );
}

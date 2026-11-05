import Link from 'next/link';
import NavMenu from '@/components/layout/NavMenu';
import { Logo } from '@/components/ui/Icon';

// A floating pill, like the reference: logo on the left, links in the middle, the orange button on the right.
// No data fetching here: the menu asks the browser-side session hook who is logged in, so pages stay cacheable.
export default function Header() {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 glass rounded-full px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SeatLock home">
          <Logo />
          <span className="display text-[1.5rem] italic leading-none">SeatLock</span>
        </Link>
        <NavMenu />
      </div>
    </header>
  );
}

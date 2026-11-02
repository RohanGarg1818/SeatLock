import Link from 'next/link';
import { Logo } from '@/components/Icon';
import ThemeToggle from '@/components/ThemeToggle';

// Login and sign-up for the organizer portal: a bare page, no navigation, so it can never be mistaken for the attendee site.
export default function OrgAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/organizer/login" className="flex items-center gap-2.5" aria-label="Organizer portal">
          <Logo /><span className="display text-[1.6rem] leading-none">SeatLock</span><span className="tag !bg-accent !text-accent-ink">Organizer</span>
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
    </>
  );
}

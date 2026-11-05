'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useSession } from '@/lib/session';

const PUBLIC_LINKS = [
  { href: '/#events', label: 'Events' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#features', label: 'Features' },
  { href: '/#faq', label: 'FAQs' },
];

export default function NavMenu() {
  const { user, volunteers } = useSession();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { // Escape closes the phone menu; the page behind it does not scroll while it is open.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  const account = user ? [
    { href: '/me', label: 'My tickets' },
    ...(volunteers ? [{ href: '/dashboard', label: 'Gate scanner' }] : []),
    ...(user.role === 'admin' ? [{ href: '/admin', label: 'Admin' }, { href: '/organizer', label: 'Manage events' }] : []),
  ] : [];
  const link = 'rounded-full px-3 py-2 text-[0.95rem] font-medium text-fg transition-colors hover:bg-bg/70';
  const active = (href: string) => (path === href || (href !== '/' && path.startsWith(href)) ? ' bg-bg/70 font-bold' : '');

  return (
    <>
      {/* Laptop */}
      <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
        {PUBLIC_LINKS.map((l) => <Link key={l.href} href={l.href} className={link}>{l.label}</Link>)}
      </nav>
      <div className="hidden items-center gap-2 lg:flex">
        {account.map((l) => <Link key={l.href} href={l.href} className={link + active(l.href)}>{l.label}</Link>)}
        <Link href="/organizer/login" className={link}>For organizers</Link>
        <ThemeToggle />
        {user ? (
          <>
            <Link href="/account" className="ml-1 flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 hover:bg-bg/70" aria-label={`${user.name}: account and settings`}>
              <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink-line bg-accent text-sm font-bold text-accent-ink">{user.name.trim().charAt(0).toUpperCase()}</span>
              <span className="max-w-[10rem] truncate text-[0.95rem] font-semibold">{user.name}</span>
            </Link>
          </>
        ) : (
          <>
            <Link className="btn btn-sm btn-ghost" href="/login">Log in</Link>
            <Link className="btn btn-sm btn-primary" href="/register">Get your pass <Icon name="arrow" size={16} /></Link>
          </>
        )}
      </div>

      {/* Phone */}
      <div className="ml-auto flex items-center gap-1 lg:hidden">
        <ThemeToggle />
        <button type="button" className="btn btn-ghost grid h-10 min-h-0 w-10 place-items-center !p-0" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-20 z-30 overflow-y-auto bg-bg px-4 pb-10 pt-4 lg:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-md flex-col">
            {user && (
              <Link href="/account" className="mb-3 flex items-center gap-3 rounded-3xl border-2 border-ink-line bg-surface-2 p-4">
                <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-ink-line bg-accent font-bold text-accent-ink">{user.name.trim().charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold leading-tight">{user.name}</p><p className="text-sm text-muted">Account and settings</p></div>
                <Icon name="arrow" className="text-muted" />
              </Link>
            )}
            {[...account, ...PUBLIC_LINKS, { href: '/organizer/login', label: 'For organizers' }].map((l) => (
              <Link key={l.href} href={l.href} className="mb-2 flex items-center justify-between rounded-full border-2 border-ink-line bg-card px-5 py-3.5 text-lg font-bold text-card-fg">{l.label}<Icon name="arrow" className="text-muted" /></Link>
            ))}
            <div className="mt-6 grid gap-3">
              {!user && (
                <>
                  <Link className="btn btn-lg btn-primary w-full" href="/register">Get your pass</Link>
                  <Link className="btn btn-lg w-full" href="/login">Log in</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import LogoutButton from './LogoutButton';

interface Props { user: { name: string; role: string } | null }

const PUBLIC_LINKS = [
  { href: '/#events', label: 'Events' },
  { href: '/#how', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#faq', label: 'FAQ' },
];

export default function NavMenu({ user }: Props) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { // Escape closes the phone menu; the page behind it does not scroll while it is open.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  const staff = user && (user.role === 'organizer' || user.role === 'admin');
  const account = user ? [
    { href: '/me', label: 'My tickets' },
    ...(staff ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
    ...(user.role === 'admin' ? [{ href: '/admin', label: 'Admin' }] : []),
  ] : [];
  const link = 'rounded-lg px-3 py-2 text-[0.95rem] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg';
  const active = (href: string) => (path === href || (href !== '/' && path.startsWith(href)) ? ' !text-fg bg-surface-2' : '');

  return (
    <>
      {/* Laptop */}
      <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
        {PUBLIC_LINKS.map((l) => <Link key={l.href} href={l.href} className={link}>{l.label}</Link>)}
      </nav>
      <div className="ml-auto hidden items-center gap-2 lg:flex">
        {account.map((l) => <Link key={l.href} href={l.href} className={link + active(l.href)}>{l.label}</Link>)}
        <ThemeToggle />
        {user ? (
          <>
            <span className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-accent-ink" title={user.name} aria-label={`Signed in as ${user.name}`}>{user.name.trim().charAt(0).toUpperCase()}</span>
            <LogoutButton className="btn btn-sm btn-ghost" />
          </>
        ) : (
          <>
            <Link className="btn btn-sm btn-ghost" href="/login">Log in</Link>
            <Link className="btn btn-sm btn-primary" href="/register">Sign up</Link>
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
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-30 overflow-y-auto bg-bg px-4 pb-10 pt-4 lg:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-md flex-col">
            {user && (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 font-bold text-accent-ink">{user.name.trim().charAt(0).toUpperCase()}</span>
                <div><p className="font-semibold leading-tight">{user.name}</p><p className="text-sm capitalize text-muted">{user.role}</p></div>
              </div>
            )}
            {[...account, ...PUBLIC_LINKS].map((l) => (
              <Link key={l.href} href={l.href} className="flex items-center justify-between border-b border-line py-4 text-lg font-medium">{l.label}<Icon name="arrow" className="text-muted" /></Link>
            ))}
            <div className="mt-6 grid gap-3">
              {user ? <LogoutButton className="btn btn-lg w-full" /> : (
                <>
                  <Link className="btn btn-lg btn-primary w-full" href="/register">Sign up free</Link>
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

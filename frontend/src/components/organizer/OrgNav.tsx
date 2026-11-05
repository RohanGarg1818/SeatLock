'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import ThemeToggle from '@/components/ui/ThemeToggle';

interface Props { user: { name: string; organization: string | null; admin?: boolean } | null; lab: boolean }

export default function OrgNav({ user, lab }: Props) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  const links = user ? [
    { href: '/organizer', label: 'My events', exact: true },
    { href: '/organizer/events/new', label: 'New event' },
    ...(lab ? [{ href: '/organizer/lab', label: 'Race & Chaos Lab' }] : []),
  ] : [];
  const base = 'rounded-lg px-3 py-2 text-[0.95rem] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg';
  const on = (l: { href: string; exact?: boolean }) => (l.exact ? path === l.href || /^\/organizer\/events\/\d+/.test(path) : path.startsWith(l.href)) ? ' !text-fg bg-surface-2' : '';

  return (
    <>
      <nav aria-label="Organizer" className="ml-6 hidden items-center gap-1 lg:flex">
        {links.map((l) => <Link key={l.href} href={l.href} className={base + on(l)}>{l.label}</Link>)}
      </nav>
      <div className="ml-auto hidden items-center gap-2 lg:flex">
        <a href="/" className={base}>View attendee site</a>
        <ThemeToggle />
        {user ? (
          <>
            <Link href="/organizer/account" className="ml-1 rounded-[4px] px-3 py-1 text-right leading-tight hover:bg-surface-2" aria-label={`${user.name}: account and settings`}>
              <span className="block text-sm font-semibold">{user.name}</span>{user.organization && <span className="block text-xs text-muted">{user.organization}</span>}
            </Link>
          </>
        ) : (
          <>
            <Link className="btn btn-sm btn-ghost" href="/organizer/login">Log in</Link>
            <Link className="btn btn-sm btn-primary" href="/organizer/signup">Sign up</Link>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1 lg:hidden">
        <ThemeToggle />
        <button type="button" className="btn btn-ghost grid h-10 min-h-0 w-10 place-items-center !p-0" aria-expanded={open} aria-controls="org-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </div>
      {open && (
        <div id="org-menu" className="fixed inset-x-0 bottom-0 top-16 z-30 overflow-y-auto bg-bg px-4 pb-10 pt-4 lg:hidden">
          <nav aria-label="Organizer mobile" className="mx-auto flex max-w-md flex-col">
            {user && (
              <Link href="/organizer/account" className="mb-3 flex items-center justify-between rounded-[4px] bg-surface-2 p-4">
                <span><span className="block font-semibold leading-tight">{user.name}</span><span className="block text-sm text-muted">{user.organization ?? 'Organizer'} · Account and settings</span></span>
                <Icon name="arrow" className="text-muted" />
              </Link>
            )}
            {links.map((l) => <Link key={l.href} href={l.href} className="mb-2 flex items-center justify-between rounded-[4px] bg-surface-2 px-4 py-4 text-lg font-medium">{l.label}<Icon name="arrow" className="text-muted" /></Link>)}
            <a href="/" className="mb-2 flex items-center justify-between rounded-[4px] bg-surface-2 px-4 py-4 text-lg font-medium">View attendee site<Icon name="arrow" className="text-muted" /></a>
            <div className="mt-6 grid gap-3">
              {!user && (
                <>
                  <Link className="btn btn-lg btn-primary w-full" href="/organizer/signup">Sign up</Link>
                  <Link className="btn btn-lg w-full" href="/organizer/login">Log in</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

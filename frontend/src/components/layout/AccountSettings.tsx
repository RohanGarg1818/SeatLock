'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/client';
import { clearSessionHint } from '@/lib/session';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Icon from '@/components/ui/Icon';

interface Props {
  portal: 'site' | 'organizer';
  user: { name: string; email: string; role: string; organization?: string | null };
  links: { href: string; label: string; hint?: string }[];
}

// One settings page for every logged-in person: who you are, your password, shortcuts to what you can do, and log out at the end.
export default function AccountSettings({ portal, user, links }: Props) {
  const base = portal === 'organizer' ? '/organizer/auth' : '/auth';
  const [name, setName] = useState(user.name);
  const [org, setOrg] = useState(user.organization ?? '');
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = user.role === 'admin';

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setBusy('profile'); setProfileMsg(null);
    try {
      await api(`${base}/me`, { method: 'PATCH', body: portal === 'organizer' ? { name, ...(org && { organization: org }) } : { name } });
      setProfileMsg({ ok: true, text: 'Saved.' }); clearSessionHint();
    } catch (err) { setProfileMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save.' }); }
    setBusy(null);
  }
  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy('pw'); setPwMsg(null);
    const form = e.currentTarget; const f = new FormData(form);
    try {
      await api(`${base}/password`, { body: { current_password: f.get('current_password'), new_password: f.get('new_password') } });
      setPwMsg({ ok: true, text: 'Password changed.' }); form.reset();
    } catch (err) { setPwMsg({ ok: false, text: err instanceof ApiError ? (err.details?.fields?.new_password ?? err.message) : 'Could not change the password.' }); }
    setBusy(null);
  }
  async function logout() {
    setBusy('logout');
    await Promise.all([
      api(portal === 'organizer' ? '/organizer/auth/logout' : '/auth/logout', { method: 'POST', body: {} }),
      ...(portal === 'organizer' && isAdmin ? [api('/auth/logout', { method: 'POST', body: {} })] : []), // an admin works here with their website session too
    ]).catch(() => {});
    clearSessionHint();
    window.location.assign(portal === 'organizer' && !isAdmin ? '/organizer/login' : '/');
  }

  const msg = (m: { ok: boolean; text: string } | null) => m && <p role={m.ok ? 'status' : 'alert'} className={`mt-3 ${m.ok ? 'text-ok' : 'text-bad'}`}>{m.text}</p>;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[4px] bg-accent text-3xl font-bold text-accent-ink">{user.name.trim().charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <h1 className="display truncate text-4xl sm:text-5xl">{user.name}</h1>
          <p className="truncate text-muted">{user.email} · <span className="capitalize">{user.role === 'participant' ? 'attendee' : user.role}</span>{user.organization ? ` · ${user.organization}` : ''}</p>
        </div>
      </div>

      {links.length > 0 && (
        <section className="mt-10" aria-labelledby="acc-links">
          <h2 id="acc-links" className="display text-2xl">Your pages</h2>
          <ul className="mt-3 space-y-2">
            {links.map((l) => (
              <li key={l.href}><Link href={l.href} className="flex items-center justify-between gap-4 rounded-[4px] bg-surface-2 px-4 py-4"><span><span className="block font-semibold">{l.label}</span>{l.hint && <span className="block text-sm text-muted">{l.hint}</span>}</span><Icon name="arrow" className="shrink-0 text-muted" /></Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="acc-profile">
        <h2 id="acc-profile" className="display text-2xl">Profile</h2>
        <form onSubmit={saveProfile} className="mt-3 space-y-4">
          <div><label className="label" htmlFor="acc-name">Name</label><input id="acc-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></div>
          {portal === 'organizer' && <div><label className="label" htmlFor="acc-org">Society or club</label><input id="acc-org" className="field" value={org} onChange={(e) => setOrg(e.target.value)} maxLength={120} required={!isAdmin} /></div>}
          <div><label className="label" htmlFor="acc-email">Email</label><input id="acc-email" className="field" value={user.email} disabled /><p className="hint mt-1">Your email is your login and cannot be changed here.</p></div>
          <button className="btn btn-primary" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button>
          {msg(profileMsg)}
        </form>
      </section>

      <section className="mt-10" aria-labelledby="acc-pw">
        <h2 id="acc-pw" className="display text-2xl">Password</h2>
        <form onSubmit={changePassword} className="mt-3 space-y-4">
          <div><label className="label" htmlFor="cur">Current password</label><input id="cur" name="current_password" type="password" className="field" autoComplete="current-password" required /></div>
          <div><label className="label" htmlFor="new">New password</label><input id="new" name="new_password" type="password" className="field" autoComplete="new-password" required /><p className="hint mt-1">At least 8 characters.</p></div>
          <button className="btn" disabled={busy === 'pw'}>{busy === 'pw' ? 'Changing…' : 'Change password'}</button>
          {msg(pwMsg)}
        </form>
      </section>

      <section className="mt-10" aria-labelledby="acc-look">
        <h2 id="acc-look" className="display text-2xl">Appearance</h2>
        <p className="mt-2 flex items-center gap-3 text-muted"><ThemeToggle /> Switch between light and dark.</p>
      </section>

      <section className="mt-12 pb-8">
        <button type="button" className="btn btn-lg w-full" onClick={logout} disabled={busy === 'logout'}>{busy === 'logout' ? 'Logging out…' : 'Log out'}</button>
      </section>
    </div>
  );
}

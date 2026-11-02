'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/client';
import Icon, { Logo } from './Icon';

// Organizer sign-up / login. Talks to /organizer/auth/*, which sets the organizer session cookie (not the attendee one).
const portalNext = (n: string | null) => (n && n.startsWith('/organizer') && !n.startsWith('//') ? n : '/organizer');

export default function OrgAuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const next = portalNext(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    const f = new FormData(e.currentTarget);
    try {
      await api(`/organizer/auth/${isLogin ? 'login' : 'register'}`, { body: Object.fromEntries(f) });
      window.location.assign(next); // one full load with the new cookie
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(err.details?.fields ?? {}); } else setError('Something went wrong.');
      setBusy(false);
    }
  }
  const perks = ['Publish an event in minutes', 'Live seat counts and a registrations table', 'Scan tickets at the gate from any phone', 'A checker that proves nothing was oversold'];
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-md border-[1.5px] border-[var(--ink-line)] bg-surface lg:grid-cols-[0.9fr_1fr]">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-[#11151a] p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5"><Logo /><span className="display text-2xl">SeatLock</span><span className="rounded-[3px] bg-white/15 px-2 py-0.5 text-sm font-semibold">Organizer</span></div>
        <div>
          <p className="display text-4xl leading-tight">{isLogin ? 'Back to your events.' : 'Run your society’s events without the chaos.'}</p>
          <ul className="mt-8 space-y-3.5">
            {perks.map((t) => <li key={t} className="flex items-start gap-3 text-white/90"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20"><Icon name="check" size={13} /></span>{t}</li>)}
          </ul>
        </div>
        <p className="text-sm text-white/70">Looking to attend an event instead? <a className="underline underline-offset-4" href="/">Go to the attendee site</a>.</p>
      </aside>

      <div className="px-6 py-10 sm:px-12 sm:py-14">
        <h1 className="display text-4xl">{isLogin ? 'Organizer log in' : 'Create an organizer account'}</h1>
        <p className="mt-2 text-muted">{isLogin ? 'For society and club organizers. Attendees log in on the main site.' : 'Separate from attendee accounts. Use the email you want event updates on.'}</p>
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          {error && <p role="alert" className="rounded-xl border border-bad bg-bad-bg p-3 text-sm text-bad">{error}</p>}
          {!isLogin && <Field name="name" label="Your name" autoComplete="name" error={fields.name} />}
          {!isLogin && <Field name="organization" label="Society or club" placeholder="e.g. Robotics Club, IPU" error={fields.organization} />}
          <Field name="email" label="Email" type="email" autoComplete="email" error={fields.email} />
          <Field name="password" label="Password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} error={fields.password} hint={isLogin ? undefined : 'At least 8 characters.'} />
          <button className="btn btn-primary btn-lg w-full" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create organizer account'}</button>
        </form>
        <p className="mt-7 text-center text-muted">
          {isLogin ? 'New organizer? ' : 'Already have an account? '}
          <Link className="font-semibold text-accent-text underline underline-offset-4" href={`${isLogin ? '/organizer/signup' : '/organizer/login'}${next !== '/organizer' ? `?next=${encodeURIComponent(next)}` : ''}`}>{isLogin ? 'Create an account' : 'Log in'}</Link>
        </p>
      </div>
    </div>
  );
}

function Field({ name, label, error, hint, ...rest }: { name: string; label: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} required className="field" aria-invalid={!!error} aria-describedby={error ? `${name}-err` : hint ? `${name}-hint` : undefined} {...rest} />
      {hint && !error && <p id={`${name}-hint`} className="hint mt-1">{hint}</p>}
      {error && <p id={`${name}-err`} className="err">{error}</p>}
    </div>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/client';
import { safeNext } from '@/lib/format';
import Icon, { Logo } from './Icon';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    const f = new FormData(e.currentTarget);
    try {
      await api(`/auth/${mode}`, { body: Object.fromEntries(f) });
      router.replace(next);
      router.refresh(); // re-run server components so the header shows the logged-in state
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(err.details?.fields ?? {}); } else setError('Something went wrong.');
      setBusy(false);
    }
  }
  const isLogin = mode === 'login';
  const perks = isLogin
    ? ['Your tickets, always one tap away', 'Continue a seat you are still holding', 'See your place on any waitlist']
    : ['Hold a seat in one click', 'A QR ticket the moment you confirm', 'Automatic waitlist when events fill up'];
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-line bg-surface shadow-[var(--shadow-lg)] lg:grid-cols-[0.9fr_1fr]">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-10 text-white lg:flex">
        <div className="absolute inset-0 -z-10 opacity-30" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.6) 1px, transparent 1.5px)', backgroundSize: '22px 22px', maskImage: 'linear-gradient(160deg, #000, transparent 75%)' }} />
        <div className="absolute -bottom-20 -right-16 -z-10 h-72 w-72 rounded-full bg-orange-400/35 blur-3xl" />
        <div className="flex items-center gap-2.5"><Logo /><span className="display text-2xl">SeatLock</span></div>
        <div>
          <p className="display text-4xl leading-tight">{isLogin ? 'Good to see you again.' : 'Your seat is one click away.'}</p>
          <ul className="mt-8 space-y-3.5">
            {perks.map((t) => <li key={t} className="flex items-start gap-3 text-white/90"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20"><Icon name="check" size={13} /></span>{t}</li>)}
          </ul>
        </div>
        <p className="text-sm text-white/70">Every seat handed out exactly once.</p>
      </aside>

      <div className="px-6 py-10 sm:px-12 sm:py-14">
        <h1 className="display text-4xl">{isLogin ? 'Welcome back' : 'Create your account'}</h1>
        <p className="mt-2 text-muted">{isLogin ? 'Log in to see your tickets and register for events.' : 'It is free and takes under a minute.'}</p>
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          {error && <p role="alert" className="rounded-xl border border-bad bg-bad-bg p-3 text-sm text-bad">{error}</p>}
          {!isLogin && <Field name="name" label="Full name" autoComplete="name" error={fields.name} />}
          <Field name="email" label="Email" type="email" autoComplete="email" error={fields.email} />
          <Field name="password" label="Password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} error={fields.password} hint={isLogin ? undefined : 'At least 8 characters.'} />
          <button className="btn btn-primary btn-lg w-full" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}</button>
        </form>
        <p className="mt-7 text-center text-muted">
          {isLogin ? 'New here? ' : 'Already have an account? '}
          <Link className="font-semibold text-accent-text underline underline-offset-4" href={`${isLogin ? '/register' : '/login'}${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>{isLogin ? 'Create an account' : 'Log in'}</Link>
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

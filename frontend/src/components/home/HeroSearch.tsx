'use client';
import { useState } from 'react';
import Icon from '@/components/ui/Icon';

// The pill in the hero: type a word, press the arrow, and the event list below filters and scrolls into view.
export default function HeroSearch() {
  const [q, setQ] = useState('');
  function go(e: React.FormEvent) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('seatlock:search', { detail: q }));
    document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' });
  }
  return (
    <form onSubmit={go} className="flex w-full max-w-md items-center gap-2 rounded-full border-2 border-ink-line bg-card p-1.5 pl-5 text-card-fg shadow-[0_4px_0_var(--ink-line)]" role="search">
      <label htmlFor="hero-q" className="sr-only">Search events</label>
      <input id="hero-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hackathons, talks, workshops…" className="min-w-0 flex-1 bg-transparent py-2 text-[1.02rem] outline-none placeholder:text-[color-mix(in_srgb,currentColor_45%,transparent)]" />
      <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-ink-line bg-accent text-accent-ink transition-transform hover:scale-105" aria-label="Search events"><Icon name="arrow" size={20} /></button>
    </form>
  );
}

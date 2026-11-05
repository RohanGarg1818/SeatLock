'use client';
import { useState } from 'react';
import type { AdminStats } from '@/lib/types';
import AdminUsers from '@/components/admin/AdminUsers';
import AdminEvents from '@/components/admin/AdminEvents';

const TABS = ['Overview', 'Events', 'Users'] as const;

export default function AdminPortal({ stats, meId }: { stats: AdminStats | null; meId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const cards: [string, number | undefined][] = [
    ['Users', stats?.users], ['Organizers', stats?.organizers], ['Events', stats?.events], ['Live events', stats?.live_events], ['Drafts', stats?.draft_events],
    ['Registrations', stats?.registrations], ['Seats on hold', stats?.holds], ['Checked in', stats?.checked_in], ['On waitlists', stats?.waitlisted],
  ];
  return (
    <div>
      <div role="tablist" aria-label="Admin sections" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} role="tab" id={`atab-${t}`} aria-selected={tab === t} aria-controls={`apanel-${t}`} onClick={() => setTab(t)}
            className={`min-h-11 px-5 font-bold ${tab === t ? 'rounded-full border-2 border-ink-line bg-accent text-accent-ink' : 'rounded-full border-2 border-transparent text-muted hover:bg-surface-2 hover:text-fg'}`}>{t}</button>
        ))}
      </div>
      <div role="tabpanel" id={`apanel-${tab}`} aria-labelledby={`atab-${tab}`} className="mt-6">
        {tab === 'Overview' && (
          stats ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {cards.map(([k, v]) => <div key={k} className="card p-4"><dt className="hint">{k}</dt><dd className="display text-4xl" data-testid={`stat-${k}`}>{v ?? 0}</dd></div>)}
            </dl>
          ) : <p className="text-muted">Could not load the numbers.</p>
        )}
        {tab === 'Events' && <AdminEvents />}
        {tab === 'Users' && (<><p className="mb-4 text-muted">Promote someone to organizer so they can create events.</p><AdminUsers meId={meId} /></>)}
      </div>
    </div>
  );
}

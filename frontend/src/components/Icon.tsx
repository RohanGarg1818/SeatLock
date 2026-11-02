// A tiny inline icon set (24x24, stroke icons). Decorative by default: pass `label` when an icon stands alone.
const P: Record<string, React.ReactNode> = {
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  pin: <><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.9.7 3.1 2.5 3.5 5.2" /></>,
  shield: <><path d="M12 21.5s7.5-3.6 7.5-9.7V5.6L12 2.8 4.5 5.6v6.2c0 6.1 7.5 9.7 7.5 9.7Z" /><path d="m8.8 12 2.3 2.3 4.2-4.6" /></>,
  ticket: <><path d="M3.5 8.5a2 2 0 0 0 0 4v0a2 2 0 0 1 0 0V16a1.5 1.5 0 0 0 1.5 1.5h14A1.5 1.5 0 0 0 20.5 16v-3.5a2 2 0 0 1 0-4V6.5A1.5 1.5 0 0 0 19 5H5a1.5 1.5 0 0 0-1.5 1.5v2Z" /><path d="M14 5v12.5" strokeDasharray="2 2.4" /></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M7.5 12h9" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4M12.5 16V8M17 16v-6" /></>,
  bolt: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" />,
  list: <><path d="M9 7h11M9 12h11M9 17h11" /><circle cx="4.8" cy="7" r="1" /><circle cx="4.8" cy="12" r="1" /><circle cx="4.8" cy="17" r="1" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="m4 8 8 5.5L20 8" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a7 7 0 0 0 9.7 9.7Z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  logout: <><path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" /><path d="M15 8l4 4-4 4M19 12H9" /></>,
};
export default function Icon({ name, size = 20, className = '', label }: { name: keyof typeof P | string; size?: number; className?: string; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>{P[name]}</svg>
  );
}

/** The SeatLock mark: a rounded square holding a 2x2 seat grid, one seat claimed. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id="slg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient></defs>
      <rect width="32" height="32" rx="9" fill="url(#slg)" />
      <rect x="7" y="7" width="7.5" height="7.5" rx="2.2" fill="var(--accent-ink)" opacity=".55" />
      <rect x="17.5" y="7" width="7.5" height="7.5" rx="2.2" fill="var(--accent-ink)" opacity=".55" />
      <rect x="7" y="17.5" width="7.5" height="7.5" rx="2.2" fill="var(--accent-ink)" opacity=".55" />
      <rect x="17.5" y="17.5" width="7.5" height="7.5" rx="2.2" fill="var(--accent-ink)" />
    </svg>
  );
}

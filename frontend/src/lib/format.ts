const TZ = 'Asia/Kolkata'; // the audience is a Delhi university; times are shown in IST regardless of the viewer's device
export const fmtDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(iso));
export const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(new Date(iso));
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
export const dayNum = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: TZ }).format(new Date(iso));
export const monthShort = (iso: string) => new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: TZ }).format(new Date(iso)).toUpperCase();

/** <input type="datetime-local"> works in the browser's local zone; the API wants an ISO instant. */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const modeLabel = { offline: 'In person', online: 'Online', hybrid: 'Hybrid' } as const;

// Only allow same-site relative redirects after login (blocks open-redirect tricks like //evil.com).
export const safeNext = (n: string | null | undefined) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

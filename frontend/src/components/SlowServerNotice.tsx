'use client';
import { useEffect, useState } from 'react';

// Free hosting puts the API to sleep after a few idle minutes; the first request then takes up to a minute.
// lib/client.ts fires these window events when a request is slow, so a click never just looks "dead".
export default function SlowServerNotice() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const on = () => setSlow(true), off = () => setSlow(false);
    window.addEventListener('seatlock:slow', on); window.addEventListener('seatlock:settled', off);
    return () => { window.removeEventListener('seatlock:slow', on); window.removeEventListener('seatlock:settled', off); };
  }, []);
  if (!slow) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-md border-[1.5px] border-[var(--ink-line)] bg-surface p-4">
      <p className="font-semibold">Waking the server up…</p>
      <p className="mt-1 text-sm text-muted">It sleeps when nobody has used it for a while. This can take up to a minute the first time. Your click is still going through.</p>
    </div>
  );
}

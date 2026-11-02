'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client';

export default function CancelBooking({ bookingId, label = 'Cancel registration' }: { bookingId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function cancel() {
    if (!window.confirm('Cancel this registration? Your seat goes back to the pool.')) return;
    setBusy(true); setErr(null);
    try { await api(`/bookings/${bookingId}/cancel`, { method: 'POST', body: {} }); router.push('/me'); router.refresh(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not cancel.'); setBusy(false); }
  }
  return (
    <div>
      <button className="btn btn-sm btn-danger" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : label}</button>
      {err && <p role="alert" className="err">{err}</p>}
    </div>
  );
}

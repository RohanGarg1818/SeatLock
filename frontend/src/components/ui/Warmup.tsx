'use client';
import { useEffect } from 'react';

// The free API host sleeps when idle and takes up to a minute to wake. Pinging it once as soon as any page loads means it
// is already waking while the visitor reads the page, so their first click does not pay the whole wait.
export default function Warmup() {
  useEffect(() => { fetch('/api/health', { cache: 'no-store' }).catch(() => { /* only a warm-up */ }); }, []);
  return null;
}

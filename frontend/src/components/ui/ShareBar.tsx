'use client';
import { useEffect, useState } from 'react';

export default function ShareBar({ title, slug }: { title: string; slug: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = () => `${origin || window.location.origin}/e/${slug}`;
  async function copy() {
    try { await navigator.clipboard.writeText(url()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt('Copy this link', url()); }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-sm" onClick={copy}><span aria-live="polite">{copied ? 'Link copied' : 'Copy link'}</span></button>
      <a className="btn btn-sm" target="_blank" rel="noopener noreferrer"
        href={`https://wa.me/?text=${encodeURIComponent(`${title}\n${origin}/e/${slug}`)}`}>Share on WhatsApp</a>
      <a className="btn btn-sm" href={`/api/public/events/${slug}/calendar.ics`}>Add to calendar</a>
    </div>
  );
}

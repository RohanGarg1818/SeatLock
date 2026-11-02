'use client';
import { api } from '@/lib/client';

// `portal="organizer"` ends the organizer-portal session (a different cookie from the attendee website's).
export default function LogoutButton({ className = 'btn btn-sm', portal }: { className?: string; portal?: 'organizer' }) {
  const organizer = portal === 'organizer';
  return (
    <button type="button" className={className} onClick={async () => { await api(organizer ? '/organizer/auth/logout' : '/auth/logout', { method: 'POST', body: {} }).catch(() => {}); window.location.assign(organizer ? '/organizer/login' : '/'); }}>
      Log out
    </button>
  );
}

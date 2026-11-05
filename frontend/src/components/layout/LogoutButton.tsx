'use client';
import { api } from '@/lib/client';
import { clearSessionHint } from '@/lib/session';

// `portal="organizer"` ends the organizer-portal session (a different cookie from the attendee website's).
export default function LogoutButton({ className = 'btn btn-sm', portal, admin = false }: { className?: string; portal?: 'organizer'; admin?: boolean }) {
  const organizer = portal === 'organizer';
  return (
    <button type="button" className={className} onClick={async () => { // An admin works in the portal with their website session, so logging out must end that one too.
      await Promise.all([
        api(organizer ? '/organizer/auth/logout' : '/auth/logout', { method: 'POST', body: {} }),
        ...(organizer && admin ? [api('/auth/logout', { method: 'POST', body: {} })] : []),
      ]).catch(() => {});
      clearSessionHint(); window.location.assign(organizer && !admin ? '/organizer/login' : '/'); }}>
      Log out
    </button>
  );
}

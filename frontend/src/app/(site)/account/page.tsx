import { redirect } from 'next/navigation';
import { getUser, serverFetch } from '@/lib/server';
import type { StaffEvent } from '@/lib/types';
import AccountSettings from '@/components/layout/AccountSettings';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/account');
  const staff = await serverFetch<{ events: StaffEvent[] }>('/me/staff-events');
  const volunteer = (staff.data?.events.length ?? 0) > 0;
  return (
    <AccountSettings portal="site" user={user} links={[
      { href: '/me', label: 'My tickets', hint: 'Your registrations and waitlist places' },
      ...(volunteer ? [{ href: '/dashboard', label: 'Volunteer desk', hint: 'Scan tickets and see who is registered' }] : []),
      ...(user.role === 'admin' ? [{ href: '/admin', label: 'Admin', hint: 'Platform overview, all events and users' }, { href: '/organizer', label: 'Manage events', hint: 'Edit any event' }] : []),
    ]} />
  );
}

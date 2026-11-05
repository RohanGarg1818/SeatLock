import { getOrganizer } from '@/lib/server';
import AccountSettings from '@/components/layout/AccountSettings';

export const metadata = { title: 'Account' };

export default async function OrganizerAccount() {
  const user = (await getOrganizer())!; // the portal layout has already sent anyone without a session to the login page
  return (
    <AccountSettings portal="organizer" user={user} links={[
      { href: '/organizer', label: user.role === 'admin' ? 'All events' : 'My events' },
      { href: '/organizer/events/new', label: 'New event' },
      ...(user.role === 'admin' ? [{ href: '/admin', label: 'Admin', hint: 'Platform overview and users' }] : []),
    ]} />
  );
}

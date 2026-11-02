import { redirect } from 'next/navigation';
import { getOrganizer } from '@/lib/server';
import OrgHeader from '@/components/organizer/OrgHeader';

// Everything under /organizer except login and sign-up needs an organizer session.
// The API checks again on every request: this redirect only gives a friendly page instead of an error.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getOrganizer();
  if (!user) redirect('/organizer/login');
  return (
    <>
      <OrgHeader />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">{children}</main>
    </>
  );
}

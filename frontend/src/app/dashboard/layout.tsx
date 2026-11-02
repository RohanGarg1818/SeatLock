import { redirect } from 'next/navigation';
import { getUser } from '@/lib/server';

// Any logged-in user may enter /dashboard (volunteers need the scanner). Each page checks the role it needs,
// and the API checks again on every request: the UI check is only there to give a friendly page.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login?next=/dashboard');
  return <>{children}</>;
}

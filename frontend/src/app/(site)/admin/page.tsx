import { redirect } from 'next/navigation';
import { getUser, serverFetch } from '@/lib/server';
import type { AdminStats } from '@/lib/types';
import AdminPortal from '@/components/admin/AdminPortal';

export const metadata = { title: 'Admin' };

export default async function AdminPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'admin') redirect('/');
  const s = await serverFetch<{ stats: AdminStats }>('/admin/stats');
  return (
    <>
      <h1 className="display text-4xl">Admin</h1>
      <p className="mt-2 text-muted">Platform overview, every organizer&apos;s events, and who can do what.</p>
      <div className="mt-8"><AdminPortal stats={s.data?.stats ?? null} meId={user.id} /></div>
    </>
  );
}

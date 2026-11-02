import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getOrganizer } from '@/lib/server';
import OrgAuthForm from '@/components/OrgAuthForm';

export const metadata = { title: 'Organizer log in' };
export default async function Page() {
  if (await getOrganizer()) redirect('/organizer');
  return <Suspense><OrgAuthForm mode="login" /></Suspense>;
}

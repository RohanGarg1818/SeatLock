import { redirect } from 'next/navigation';

// The scanner now lives on the volunteer desk, together with the registration sheet.
export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/events/${id}`);
}

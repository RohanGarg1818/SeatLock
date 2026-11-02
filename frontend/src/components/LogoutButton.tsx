'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function LogoutButton({ className = 'btn btn-sm' }: { className?: string }) {
  const router = useRouter();
  return (
    <button type="button" className={className} onClick={async () => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); router.push('/'); router.refresh(); }}>
      Log out
    </button>
  );
}

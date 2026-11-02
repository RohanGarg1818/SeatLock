'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { AdminUser, Role } from '@/lib/types';

export default function AdminUsers({ meId }: { meId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (reset: boolean, after?: string | null) => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '25' });
    if (q.trim()) p.set('q', q.trim());
    if (!reset && after) p.set('after', after);
    try {
      const r = await api<{ users: AdminUser[]; next_cursor: string | null }>(`/admin/users?${p}`);
      setUsers((old) => (reset ? r.users : [...old, ...r.users])); setCursor(r.next_cursor);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load users.'); }
    setLoading(false);
  }, [q]);
  useEffect(() => { const t = setTimeout(() => load(true), 250); return () => clearTimeout(t); }, [load]);

  async function setRole(id: string, role: Role) {
    setError(null);
    try { const r = await api<{ user: AdminUser }>(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }); setUsers((u) => u.map((x) => (x.id === id ? { ...x, role: r.user.role } : x))); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.'); }
  }

  return (
    <div>
      <div className="max-w-sm"><label className="label" htmlFor="uq">Search name or email</label><input id="uq" className="field" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <p role="alert" className="err mt-3">{error}</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Users</caption>
          <thead><tr className="bg-surface-2 text-left"><th scope="col" className="py-2 pr-4">Name</th><th scope="col" className="pr-4">Email</th><th scope="col">Role</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="even:bg-surface-2/60">
                <td className="py-2 pr-4 font-medium">{u.name}</td><td className="pr-4">{u.email}</td>
                <td>
                  <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.name}</label>
                  <select id={`role-${u.id}`} className="field w-40 py-1" value={u.role} disabled={u.id === meId} onChange={(e) => setRole(u.id, e.target.value as Role)}>
                    <option value="participant">participant</option><option value="organizer">organizer</option><option value="admin">admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && <p className="mt-4 text-muted">No users match.</p>}
      </div>
      {cursor && <button className="btn mt-4" disabled={loading} onClick={() => load(false, cursor)}>Load more</button>}
    </div>
  );
}

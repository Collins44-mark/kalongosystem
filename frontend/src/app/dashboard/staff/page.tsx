'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RoleGuard } from '@/components/RoleGuard';

type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role_name: string;
  department_code: string;
  is_manager: boolean;
  permission_codes: string[];
};
type Role = { id: number; name: string; permissions: { code: string }[] };
type Permission = { id: number; code: string; name: string };

export default function StaffPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<User[] | { results: User[] }>('/api/users/').then((r) => Array.isArray(r) ? r : (r.results || [])),
      api.get<Role[] | { results: Role[] }>('/api/roles/').then((r) => Array.isArray(r) ? r : (r.results || [])),
      api.get<Permission[] | { results: Permission[] }>('/api/permissions/').then((r) => Array.isArray(r) ? r : (r.results || [])),
    ]).then(([u, r, p]) => {
      setUsers(u);
      setRoles(r);
      setPermissions(p);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500">Loading…</div>;

  return (
    <RoleGuard permission="manage_roles" fallback={<p className="text-slate-500">No access.</p>}>
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-8">Staff, roles & permissions</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Users</h2>
            <ul className="space-y-2">
              {users.map((u) => (
                <li key={u.id} className="flex justify-between items-center py-2 border-b border-slate-100">
                  <div>
                    <p className="font-medium text-slate-800">{u.first_name} {u.last_name} ({u.username})</p>
                    <p className="text-sm text-slate-500">{u.role_name} · {u.department_code}</p>
                  </div>
                  {u.is_manager && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">Manager</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Roles & permissions</h2>
            <p className="text-sm text-slate-600 mb-4">Roles are collections of permissions. UI adapts to permission_codes (no hard-coded roles).</p>
            <ul className="space-y-3">
              {roles.map((role) => (
                <li key={role.id} className="p-3 bg-slate-50 rounded-lg">
                  <p className="font-medium text-slate-800">{role.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {role.permissions?.map((p) => p.code).join(', ') || '—'}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-4">Total permissions: {permissions.length}</p>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

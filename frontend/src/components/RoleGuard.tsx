'use client';

import { useAuth } from '@/contexts/AuthContext';

type RoleGuardProps = {
  permission?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

/**
 * Show children only if user has the given permission (or is manager/superuser).
 * No hard-coded roles; UI adapts to permission_codes.
 */
export function RoleGuard({ permission, children, fallback = null }: RoleGuardProps) {
  const { user } = useAuth();
  if (!user) return <>{fallback}</>;
  if (user.is_staff) return <>{children}</>;
  if (user.is_manager) return <>{children}</>;
  if (!permission) return <>{children}</>;
  const has = user.permission_codes && user.permission_codes.includes(permission);
  return has ? <>{children}</> : <>{fallback}</>;
}

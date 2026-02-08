import { roleForPermission } from './roles';

/** Default landing page per role (Overview is MANAGER only). */
export function defaultDashboardRoute(role: string | null | undefined): string {
  const r = roleForPermission(role) || (role ? role.toString().trim().toUpperCase() : '');
  if (r === 'MANAGER') return '/dashboard';
  if (r === 'FRONT_OFFICE') return '/dashboard/front-office';
  if (r === 'FINANCE') return '/dashboard/finance';
  if (r === 'HOUSEKEEPING') return '/dashboard/housekeeping';
  if (r === 'BAR') return '/dashboard/bar';
  if (r === 'RESTAURANT' || r === 'KITCHEN') return '/dashboard/restaurant';
  return '/dashboard';
}

export function isOverviewAllowed(role: string | null | undefined): boolean {
  const r = roleForPermission(role) || (role ? role.toString().trim().toUpperCase() : '');
  return r === 'MANAGER';
}


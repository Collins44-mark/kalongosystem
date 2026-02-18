/**
 * Central configuration: which dashboard modules each business type can access.
 * Used for sidebar filtering and route protection. Keep in sync with backend.
 */

export type BusinessType = 'HOTEL' | 'LODGE' | 'BAR' | 'RESTAURANT';

export type DashboardModule =
  | 'overview'
  | 'front-office'
  | 'bar'
  | 'restaurant'
  | 'housekeeping'
  | 'finance'
  | 'workers'
  | 'inventory'
  | 'reports'
  | 'settings'
  | 'messages';

export const BUSINESS_MODULE_ACCESS: Record<BusinessType, readonly DashboardModule[]> = {
  HOTEL: [
    'overview',
    'front-office',
    'bar',
    'restaurant',
    'housekeeping',
    'finance',
    'workers',
    'inventory',
    'reports',
    'settings',
    'messages',
  ],
  LODGE: ['overview', 'front-office', 'finance', 'workers', 'reports', 'settings', 'messages'],
  BAR: ['overview', 'bar', 'finance', 'inventory', 'reports', 'settings', 'messages'],
  RESTAURANT: ['overview', 'restaurant', 'finance', 'inventory', 'reports', 'settings', 'messages'],
};

const PATH_TO_MODULE: Record<string, DashboardModule> = {
  '/dashboard': 'overview',
  '/dashboard/front-office': 'front-office',
  '/dashboard/bar': 'bar',
  '/dashboard/restaurant': 'restaurant',
  '/dashboard/housekeeping': 'housekeeping',
  '/dashboard/finance': 'finance',
  '/dashboard/workers': 'workers',
  '/dashboard/inventory': 'inventory',
  '/dashboard/reports': 'reports',
  '/dashboard/settings': 'settings',
  '/dashboard/messages': 'messages',
};

/** Get allowed module keys for a business type. Unknown types get minimal access (overview + settings). */
export function getAllowedModules(businessType: string | null | undefined): DashboardModule[] {
  if (!businessType) return [];
  const key = businessType.toUpperCase() as BusinessType;
  if (key in BUSINESS_MODULE_ACCESS) return [...BUSINESS_MODULE_ACCESS[key]];
  return ['overview', 'settings'];
}

/** True if the given path is allowed for this business type. */
export function isRouteAllowedForBusinessType(
  businessType: string | null | undefined,
  path: string,
): boolean {
  let module = PATH_TO_MODULE[path];
  if (!module && path.startsWith('/dashboard/')) {
    const segment = path.split('/').filter(Boolean)[1]; // e.g. 'bar' from /dashboard/bar/123
    if (segment) module = PATH_TO_MODULE[`/dashboard/${segment}`] ?? null;
  }
  if (!module) return true; // unknown paths allowed; parent route guard applies
  const allowed = getAllowedModules(businessType);
  return allowed.includes(module);
}

/** Resolve dashboard path to module key, or null if not a known module path. */
export function getModuleFromPath(path: string): DashboardModule | null {
  return PATH_TO_MODULE[path] ?? null;
}

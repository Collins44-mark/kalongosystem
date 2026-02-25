/**
 * Central configuration: which dashboard modules each business type can access.
 * Must stay in sync with frontend config/businessModules.ts.
 * Used for backend route protection (403 when module not allowed).
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
  | 'tasks';

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
    'tasks',
  ],
  LODGE: ['overview', 'front-office', 'finance', 'workers', 'reports', 'settings', 'tasks'],
  BAR: ['overview', 'bar', 'finance', 'inventory', 'reports', 'settings', 'tasks'],
  RESTAURANT: ['overview', 'restaurant', 'finance', 'inventory', 'reports', 'settings', 'tasks'],
};

export function isModuleAllowedForBusinessType(
  businessType: string | null | undefined,
  module: DashboardModule,
): boolean {
  if (!businessType) return false;
  const key = businessType.toUpperCase() as BusinessType;
  if (!(key in BUSINESS_MODULE_ACCESS)) return false;
  return (BUSINESS_MODULE_ACCESS[key] as readonly string[]).includes(module);
}

/**
 * Role hierarchy: MANAGER (admin-level) > FRONT_OFFICE > operational roles
 * ADMIN and OWNER are treated as MANAGER-level (highest) access.
 */
export const MANAGER_LEVEL_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;
export type ManagerLevelRole = (typeof MANAGER_LEVEL_ROLES)[number];

/** Roles that have manager-level or higher access */
export function isManagerLevel(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toString().trim().toUpperCase();
  return MANAGER_LEVEL_ROLES.includes(r as ManagerLevelRole);
}

/** Normalize role for permission checks - ADMIN/OWNER map to MANAGER */
export function normalizeRole(role: string | null | undefined): string | null {
  if (!role) return null;
  const r = role.toString().trim().toUpperCase();
  if (MANAGER_LEVEL_ROLES.includes(r as ManagerLevelRole)) return 'MANAGER';
  return r;
}

/** Check if user has one of the required roles (with hierarchy: MANAGER-level always passes) */
export function hasRole(
  userRole: string | null | undefined,
  requiredRoles: string[],
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  if (isManagerLevel(userRole)) return true;
  const role = (userRole || '').toString().trim().toUpperCase();
  if (!role) return false;
  const required = requiredRoles.map((r) => (r || '').toString().toUpperCase());
  return required.includes(role);
}

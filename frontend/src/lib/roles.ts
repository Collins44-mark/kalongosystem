/**
 * Role hierarchy: MANAGER (admin-level) > FRONT_OFFICE > operational roles
 * ADMIN and OWNER are treated as MANAGER-level (highest) access.
 */
const MANAGER_LEVEL_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;

export function isManagerLevel(role: string | null | undefined): boolean {
  if (!role) return false;
  return MANAGER_LEVEL_ROLES.includes(role.toString().trim().toUpperCase() as (typeof MANAGER_LEVEL_ROLES)[number]);
}

/** Normalize role for UI - ADMIN/OWNER displayed as MANAGER for permission checks */
export function roleForPermission(role: string | null | undefined): string | null {
  if (!role) return null;
  const r = role.toString().trim().toUpperCase();
  if (MANAGER_LEVEL_ROLES.includes(r as (typeof MANAGER_LEVEL_ROLES)[number])) return 'MANAGER';
  return r;
}

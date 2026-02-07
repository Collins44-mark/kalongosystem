import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const SKIP_ROLES_KEY = 'skipRoles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const SkipRolesGuard = () => SetMetadata(SKIP_ROLES_KEY, true);

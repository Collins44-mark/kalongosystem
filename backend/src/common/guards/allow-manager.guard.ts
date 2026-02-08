import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { isManagerLevel } from '../utils/roles';

/** Allows MANAGER, ADMIN, OWNER (admin-level roles). Removed businessId fallback for security. */
@Injectable()
export class AllowManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Authentication required');
    if (isManagerLevel(user.role)) return true;
    throw new ForbiddenException('Insufficient permissions');
  }
}

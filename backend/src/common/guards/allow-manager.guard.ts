import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/** Allows MANAGER, ADMIN, OWNER, or any user with businessId (covers edge cases). */
@Injectable()
export class AllowManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Authentication required');
    const role = (user.role || '').toUpperCase();
    if (['MANAGER', 'ADMIN', 'OWNER'].includes(role)) return true;
    if (user.businessId) return true;
    throw new ForbiddenException('Insufficient permissions');
  }
}

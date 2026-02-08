import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { isManagerLevel } from '../utils/roles';

/** Allows MANAGER, ADMIN, OWNER (admin-level roles). */
@Injectable()
export class AllowManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      const hasAuthHeader = !!request.headers?.authorization;
      throw new UnauthorizedException(
        hasAuthHeader ? 'Session expired. Please log in again.' : 'Authentication required',
      );
    }
    if (isManagerLevel(user.role)) return true;
    throw new ForbiddenException('Insufficient permissions');
  }
}

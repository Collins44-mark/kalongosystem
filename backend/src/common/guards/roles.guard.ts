import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, SKIP_ROLES_KEY } from '../decorators/roles.decorator';
import { hasRole } from '../utils/roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      const hasAuthHeader = !!request.headers?.authorization;
      throw new UnauthorizedException(
        hasAuthHeader ? 'Session expired. Please log in again.' : 'Authentication required',
      );
    }

    if (hasRole(user.role, requiredRoles)) return true;
    throw new ForbiddenException('Insufficient permissions');
  }
}

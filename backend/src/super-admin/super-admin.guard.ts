import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (user?.role === 'SUPER_ADMIN' || user?.isSuperAdmin === true) return true;
    throw new ForbiddenException('Super admin only');
  }
}


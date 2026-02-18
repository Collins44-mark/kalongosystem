import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator';
import {
  isModuleAllowedForBusinessType,
  type DashboardModule,
} from '../../config/business-modules';

@Injectable()
export class BusinessModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const module = this.reflector.getAllAndOverride<DashboardModule>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!module) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { businessId?: string } | undefined;
    if (!user?.businessId) return true; // let auth guard handle

    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: { businessType: true },
    });
    if (!business) return true;

    if (isModuleAllowedForBusinessType(business.businessType, module)) return true;
    throw new ForbiddenException('Access not allowed for this business type');
  }
}

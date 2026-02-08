import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Ensures business subscription is TRIAL or ACTIVE - blocks EXPIRED */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.businessId) {
      throw new ForbiddenException('No business context. Please log in with a business.');
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { businessId: user.businessId },
    });

    if (!sub) throw new ForbiddenException('No subscription found');
    if (sub.status === 'EXPIRED') {
      throw new ForbiddenException(
        'Subscription expired. System is read-only. Please renew.',
      );
    }

    request.subscription = sub;
    return true;
  }
}

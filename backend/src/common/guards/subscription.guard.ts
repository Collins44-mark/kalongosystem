import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SUBSCRIPTION_BLOCKED_MESSAGE =
  'Subscribe to continue using the service. Contact the sales team to renew.';

/** Ensures business subscription is active: TRIAL within trial period, or ACTIVE within paid period. Blocks when expired. */
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

    if (!sub) throw new ForbiddenException(SUBSCRIPTION_BLOCKED_MESSAGE);

    const now = new Date();

    // Already marked expired
    if (sub.status === 'EXPIRED') {
      throw new ForbiddenException(SUBSCRIPTION_BLOCKED_MESSAGE);
    }

    // Trial: block if past trial end
    if (sub.status === 'TRIAL') {
      if (now > sub.trialEndsAt) {
        await this.prisma.subscription.update({
          where: { businessId: user.businessId },
          data: { status: 'EXPIRED' },
        });
        throw new ForbiddenException(SUBSCRIPTION_BLOCKED_MESSAGE);
      }
      request.subscription = sub;
      return true;
    }

    // ACTIVE: block if past current period end
    if (sub.status === 'ACTIVE') {
      if (sub.currentPeriodEnd && now > sub.currentPeriodEnd) {
        await this.prisma.subscription.update({
          where: { businessId: user.businessId },
          data: { status: 'EXPIRED' },
        });
        throw new ForbiddenException(SUBSCRIPTION_BLOCKED_MESSAGE);
      }
      request.subscription = sub;
      return true;
    }

    throw new ForbiddenException(SUBSCRIPTION_BLOCKED_MESSAGE);
  }
}

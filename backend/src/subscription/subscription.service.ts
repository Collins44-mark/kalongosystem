import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async getForBusiness(businessId: string) {
    return this.prisma.subscription.findUnique({
      where: { businessId },
    });
  }

  /** Mock payment - in production, integrate Mobile Money / Bank */
  async processPayment(businessId: string, plan: string, paymentMethod: string) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.prisma.subscription.update({
      where: { businessId },
      data: {
        plan: plan === 'FRONT_OFFICE_ONLY' ? 'FRONT_OFFICE_ONLY' : 'FRONT_AND_BACK',
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd,
      },
    });
    return { success: true, message: 'Payment successful. Subscription active.' };
  }
}

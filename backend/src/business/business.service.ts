import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Generate unique business_id like HMS-49281 */
function generateBusinessId(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `HMS-${num}`;
}

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    businessType: string;
    name: string;
    location?: string;
    phone?: string;
  }) {
    let businessId = generateBusinessId();
    while (await this.prisma.business.findUnique({ where: { businessId } })) {
      businessId = generateBusinessId();
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const business = await this.prisma.business.create({
      data: {
        businessId,
        businessType: data.businessType,
        name: data.name,
        location: data.location,
        phone: data.phone,
        createdBy: data.userId,
      },
    });

    await this.prisma.businessUser.create({
      data: {
        userId: data.userId,
        businessId: business.id,
        role: 'ADMIN',
        branchId: 'main',
        createdBy: data.userId,
      },
    });

    await this.prisma.subscription.create({
      data: {
        businessId: business.id,
        plan: 'FRONT_AND_BACK',
        status: 'TRIAL',
        trialEndsAt,
      },
    });

    const bu = await this.prisma.businessUser.findFirst({
      where: { userId: data.userId, businessId: business.id },
      include: { user: true },
    });

    return {
      business: {
        id: business.id,
        businessId: business.businessId,
        name: business.name,
        businessType: business.businessType,
        trialEndsAt,
      },
      message: 'Business registered. 14-day trial started.',
      businessUser: bu,
    };
  }

  async getByCode(businessId: string) {
    const b = await this.prisma.business.findUnique({
      where: { businessId },
      include: { subscription: true },
    });
    if (!b) throw new NotFoundException('Business not found');
    return b;
  }
}

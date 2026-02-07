import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiService {
  constructor(private prisma: PrismaService) {}

  async getMe(user: { sub: string; email: string; businessId: string; role: string; businessCode?: string }) {
    if (!user.businessId) throw new UnauthorizedException('No business context');

    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
    });
    if (!business) throw new UnauthorizedException('Business not found');

    const role = user.role === 'ADMIN' ? 'MANAGER' : user.role;

    return {
      email: user.email,
      role,
      business: {
        id: business.id,
        name: business.name,
        code: business.businessId,
      },
    };
  }
}

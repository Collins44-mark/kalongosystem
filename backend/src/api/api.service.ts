import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiService {
  constructor(private prisma: PrismaService) {}

  async getMe(user: { sub: string; email: string; businessId: string; role: string; businessCode?: string }) {
    if (!user.businessId) throw new UnauthorizedException('No business context');

    const [business, dbUser] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: user.businessId } }),
      this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { language: true },
      }),
    ]);
    if (!business) throw new UnauthorizedException('Business not found');

    const role = ['ADMIN', 'OWNER'].includes(user.role || '') ? 'MANAGER' : user.role;

    return {
      email: user.email,
      role,
      language: dbUser?.language ?? 'en',
      business: {
        id: business.id,
        name: business.name,
        code: business.businessId,
      },
    };
  }

  async updateLanguage(userId: string, language: string) {
    const valid = ['en', 'sw'];
    if (!valid.includes(language)) throw new BadRequestException('Invalid language');
    await this.prisma.user.update({
      where: { id: userId },
      data: { language },
    });
    return { language };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(businessId: string, email: string, password: string) {
    const cleanBusinessId = (businessId || '').toUpperCase().trim();
    const cleanEmail = (email || '').toLowerCase().trim();
    const cleanPassword = (password || '').trim();

    if (cleanBusinessId !== 'HMS-1') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, email: true, password: true, isSuperAdmin: true, language: true, name: true },
    });
    if (!user || user.isSuperAdmin !== true) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(cleanPassword, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: user.id,
      email: user.email,
      role: 'SUPER_ADMIN',
      isSuperAdmin: true,
      businessCode: 'HMS-1',
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? 'Super Admin',
        role: 'SUPER_ADMIN',
        businessId: 'HMS-1',
        language: user.language ?? 'en',
      },
    };
  }

  async listBusinesses() {
    const rows = await this.prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        businessId: true,
        createdAt: true,
        isSuspended: true,
        _count: { select: { businessUsers: true } },
      },
    });
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      businessId: b.businessId,
      createdAt: b.createdAt,
      status: b.isSuspended ? 'SUSPENDED' : 'ACTIVE',
      totalUsers: b._count.businessUsers,
    }));
  }

  async getBusinessDetail(businessDbId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessDbId },
      include: {
        subscription: true,
        settings: { where: { key: { in: ['vat_enabled', 'vat_rate', 'vat_type'] } } },
        businessUsers: {
          include: { user: { select: { id: true, email: true, isSuperAdmin: true, forcePasswordChange: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!business) throw new NotFoundException('Business not found');

    const settingsMap = new Map(business.settings.map((s) => [s.key, s.value]));
    const vat_enabled = settingsMap.get('vat_enabled') === 'true' || settingsMap.get('vat_enabled') === '1';
    const vat_rate = Number(settingsMap.get('vat_rate') ?? 0) || 0;
    const vat_type = settingsMap.get('vat_type') === 'exclusive' ? 'exclusive' : 'inclusive';

    return {
      business: {
        id: business.id,
        name: business.name,
        businessId: business.businessId,
        createdAt: business.createdAt,
        status: business.isSuspended ? 'SUSPENDED' : 'ACTIVE',
      },
      vat: { vat_enabled, vat_rate, vat_type },
      subscription: business.subscription
        ? {
            plan: business.subscription.plan,
            status: business.subscription.status,
            trialEndsAt: business.subscription.trialEndsAt,
            currentPeriodEnd: business.subscription.currentPeriodEnd,
          }
        : null,
      users: business.businessUsers.map((bu) => ({
        businessUserId: bu.id,
        userId: bu.userId,
        email: bu.user.email,
        role: bu.role,
        status: bu.isDisabled ? 'DISABLED' : 'ACTIVE',
        forcePasswordChange: bu.user.forcePasswordChange,
      })),
    };
  }

  async setBusinessSuspended(businessDbId: string, suspended: boolean) {
    const b = await this.prisma.business.findUnique({ where: { id: businessDbId } });
    if (!b) throw new NotFoundException('Business not found');
    await this.prisma.business.update({ where: { id: businessDbId }, data: { isSuspended: suspended } });
    return { success: true, status: suspended ? 'SUSPENDED' : 'ACTIVE' };
  }

  async resetBusinessUserPassword(businessUserId: string) {
    const bu = await this.prisma.businessUser.findUnique({
      where: { id: businessUserId },
      include: { user: true },
    });
    if (!bu) throw new NotFoundException('User not found');
    if (bu.user.isSuperAdmin) throw new ForbiddenException('Cannot reset super admin password here');

    const temp = this.generateTempPassword();
    const hashed = await bcrypt.hash(temp, 10);

    await this.prisma.user.update({
      where: { id: bu.userId },
      data: { password: hashed, forcePasswordChange: true },
    });

    return { temporaryPassword: temp };
  }

  private generateTempPassword() {
    // 10 chars base64url-ish
    return randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  }
}


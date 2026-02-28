import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

function generateBusinessId(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `HMS-${num}`;
}

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private readonly SUPER_ADMIN_EMAIL = 'markkcollins979@gmail.com';
  private readonly SUPER_ADMIN_BUSINESS_ID = 'HMS-1';
  private readonly SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_INIT_PASSWORD || 'Super@44';

  /** Ensure super-admin user exists (called on startup). Idempotent - safe to run multiple times. */
  async ensureSuperAdminExists(): Promise<void> {
    const email = this.SUPER_ADMIN_EMAIL.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { isSuperAdmin: true },
    });
    if (existing?.isSuperAdmin === true) return;
    await this.seedSuperAdmin();
  }

  /** Idempotent seed: ensures Business HMS-1, User, BusinessUser, Subscription exist. Uses bcrypt for password. */
  async seedSuperAdmin(): Promise<{ ok: boolean; message: string }> {
    const email = this.SUPER_ADMIN_EMAIL.toLowerCase().trim();
    const businessId = this.SUPER_ADMIN_BUSINESS_ID;
    const hashed = await bcrypt.hash(this.SUPER_ADMIN_PASSWORD, 10);

    const business = await this.prisma.business.upsert({
      where: { businessId },
      update: {},
      create: {
        businessId,
        businessType: 'HOTEL',
        name: 'Super Admin Business',
        createdBy: null,
      },
    });

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 365);
    await this.prisma.subscription.upsert({
      where: { businessId: business.id },
      update: {},
      create: {
        businessId: business.id,
        plan: 'FRONT_AND_BACK',
        status: 'TRIAL',
        trialEndsAt,
      },
    });

    const user = await this.prisma.user.upsert({
      where: { email },
      update: {
        password: hashed,
        isSuperAdmin: true,
        forcePasswordChange: false,
        name: 'Super Admin',
        language: 'en',
      },
      create: {
        email,
        password: hashed,
        language: 'en',
        isSuperAdmin: true,
        forcePasswordChange: false,
        name: 'Super Admin',
      },
    });

    await this.prisma.businessUser.upsert({
      where: {
        userId_businessId: { userId: user.id, businessId: business.id },
      },
      update: { role: 'MANAGER' },
      create: {
        userId: user.id,
        businessId: business.id,
        role: 'MANAGER',
        branchId: 'main',
      },
    });

    return { ok: true, message: `Super admin ready: ${email}. Log in with Business ID ${businessId}.` };
  }

  /**
   * Delete a user by email (so they can sign up again). Cascades to BusinessUser.
   * Does not delete super-admin users. Businesses the user created remain in DB but orphaned.
   */
  async deleteUserByEmail(email: string): Promise<{ ok: boolean; message: string }> {
    const cleanEmail = (email || '').toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, isSuperAdmin: true },
    });
    if (!user) {
      return { ok: false, message: `No user found with email ${cleanEmail}.` };
    }
    if (user.isSuperAdmin) {
      return { ok: false, message: 'Cannot delete super-admin user. Use a different email.' };
    }
    await this.prisma.user.delete({ where: { id: user.id } });
    return { ok: true, message: `User ${cleanEmail} deleted. You can sign up again with this email.` };
  }

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

  /** Register a new business (no user yet – they sign up with the returned businessId). 14-day trial. */
  async registerBusiness(data: { name: string; businessType: string; location?: string; phone?: string }) {
    const name = (data.name || '').trim();
    const businessType = (data.businessType || 'HOTEL').trim() || 'HOTEL';
    if (!name) throw new BadRequestException('Business name is required');

    let businessId = generateBusinessId();
    while (await this.prisma.business.findUnique({ where: { businessId } })) {
      businessId = generateBusinessId();
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const business = await this.prisma.business.create({
      data: {
        businessId,
        businessType,
        name,
        location: data.location?.trim() || null,
        phone: data.phone?.trim() || null,
        createdBy: null,
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

    return {
      success: true,
      message: 'Business registered. 14-day trial started. Share the Business ID with the client to sign up.',
      business: {
        id: business.id,
        businessId: business.businessId,
        name: business.name,
        businessType: business.businessType,
        trialEndsAt: trialEndsAt.toISOString(),
      },
    };
  }

  /** List all registered businesses (no filter - super-admin sees everything). */
  async listBusinesses() {
    const rows = await this.prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        businessId: true,
        businessType: true,
        createdAt: true,
        isSuspended: true,
        _count: { select: { businessUsers: true } },
      },
    });
    const list = rows.map((b) => ({
      id: b.id,
      name: b.name,
      businessId: b.businessId,
      businessType: b.businessType,
      createdAt: b.createdAt,
      status: b.isSuspended ? 'SUSPENDED' : 'ACTIVE',
      totalUsers: b._count.businessUsers,
    }));
    return { businesses: list, total: list.length };
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
        businessType: business.businessType,
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

  /** Update business type (dashboard module access changes immediately for that tenant). */
  async updateBusinessType(businessDbId: string, businessType: string) {
    const allowed = ['HOTEL', 'LODGE', 'BAR', 'RESTAURANT'];
    const type = (businessType || '').trim().toUpperCase();
    if (!allowed.includes(type)) throw new BadRequestException(`businessType must be one of: ${allowed.join(', ')}`);
    const b = await this.prisma.business.findUnique({ where: { id: businessDbId } });
    if (!b) throw new NotFoundException('Business not found');
    await this.prisma.business.update({ where: { id: businessDbId }, data: { businessType: type } });
    return { success: true, businessType: type };
  }

  /** Unlock / add time: if subscription is ACTIVE and current period end is in the future, extend from that date; otherwise set period from today. */
  async unlockSubscription(businessDbId: string, durationDays: number) {
    const b = await this.prisma.business.findUnique({
      where: { id: businessDbId },
      include: { subscription: true },
    });
    if (!b) throw new NotFoundException('Business not found');
    if (!b.subscription) throw new BadRequestException('Business has no subscription record');

    const days = Math.max(1, Math.min(366, Math.floor(durationDays))); // up to 12 months
    const now = new Date();
    const sub = b.subscription;

    // If currently ACTIVE and period end is in the future, add time from that end; otherwise start from today.
    let currentPeriodEnd: Date;
    if (sub.status === 'ACTIVE' && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now) {
      currentPeriodEnd = new Date(sub.currentPeriodEnd);
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + days);
    } else {
      currentPeriodEnd = new Date(now);
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + days);
    }

    await this.prisma.subscription.update({
      where: { businessId: b.id },
      data: {
        status: 'ACTIVE',
        plan: sub.plan || 'FRONT_AND_BACK',
        currentPeriodEnd,
      },
    });
    return {
      success: true,
      message: `Subscription updated. Service active until ${currentPeriodEnd.toISOString().slice(0, 10)}.`,
      currentPeriodEnd: currentPeriodEnd.toISOString(),
    };
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


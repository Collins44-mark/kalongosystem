import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { StaffWorkersService } from '../staff-workers/staff-workers.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private staffWorkers: StaffWorkersService,
  ) {}

  /** Signup: email + password + business_name. Creates User, Business, BusinessUser (MANAGER), Subscription. */
  async signup(email: string, password: string, businessName: string) {
    const cleanEmail = (email || '').toLowerCase().trim();
    const cleanPassword = (password || '').trim();
    const cleanBusinessName = (businessName || '').trim();

    const existing = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existing) throw new ConflictException('Email already registered');

    if (cleanPassword.length < 6) throw new BadRequestException('Password must be at least 6 characters');
    if (!cleanBusinessName) throw new BadRequestException('business_name required');

    const hashed = await bcrypt.hash(cleanPassword, 10);
    const businessId = await this.generateBusinessCode();

    const [user, business, subscription] = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: cleanEmail,
          password: hashed,
          language: 'en',
        },
        select: { id: true, email: true, language: true },
      });

      const b = await tx.business.create({
        data: {
          businessId,
          businessType: 'HOTEL',
          name: cleanBusinessName,
          createdBy: u.id,
        },
      });

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      await tx.businessUser.create({
        data: {
          userId: u.id,
          businessId: b.id,
          role: 'MANAGER',
          branchId: 'main',
          createdBy: u.id,
        },
      });

      const sub = await tx.subscription.create({
        data: {
          businessId: b.id,
          plan: 'FRONT_AND_BACK',
          status: 'TRIAL',
          trialEndsAt,
        },
      });

      return [u, b, sub] as const;
    });

    const payload = {
      sub: user.id,
      email: user.email,
      businessId: business.id,
      businessCode: business.businessId,
      role: 'MANAGER',
      branchId: 'main',
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        language: user.language ?? 'en',
        businessId: business.businessId,
        role: 'MANAGER',
      },
      business: { name: business.name, businessId: business.businessId },
      message: 'Account created. 14-day trial started.',
    };
  }

  private async generateBusinessCode(): Promise<string> {
    let code: string;
    do {
      const num = Math.floor(10000 + Math.random() * 90000);
      code = `HMS-${num}`;
    } while (await this.prisma.business.findUnique({ where: { businessId: code } }));
    return code;
  }

  /** Login: Business ID + Email + Password. Returns JWT with tenant context. */
  async login(businessId: string, email: string, password: string) {
    const cleanBusinessId = (businessId || '').toUpperCase().trim();
    const cleanEmail = (email || '').toLowerCase().trim();
    const cleanPassword = (password || '').trim();

    if (!/^HMS-\d+$/i.test(cleanBusinessId)) {
      throw new BadRequestException('Business ID must be like HMS-12345');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, email: true, name: true, language: true, password: true, forcePasswordChange: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const bu = await this.prisma.businessUser.findFirst({
      where: {
        userId: user.id,
        business: { businessId: cleanBusinessId },
      },
      include: { business: { include: { subscription: true } } },
    });
    if (!bu) throw new UnauthorizedException('No account for this Business ID and email. Use the exact Business ID from signup (e.g. HMS-12345) and the same email and password.');

    if (bu.business?.isSuspended === true) {
      throw new ForbiddenException('Subscribe to continue using the service. Contact the sales team to renew.');
    }
    const sub = bu.business?.subscription;
    if (sub?.status === 'EXPIRED') {
      throw new ForbiddenException('Subscribe to continue using the service. Contact the sales team to renew.');
    }
    const now = new Date();
    if (sub?.status === 'TRIAL' && sub.trialEndsAt && now > sub.trialEndsAt) {
      throw new ForbiddenException('Subscribe to continue using the service. Contact the sales team to renew.');
    }
    if (sub?.status === 'ACTIVE' && sub.currentPeriodEnd && now > sub.currentPeriodEnd) {
      throw new ForbiddenException('Subscribe to continue using the service. Contact the sales team to renew.');
    }

    const valid = await bcrypt.compare(cleanPassword, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const role = ['ADMIN', 'OWNER'].includes(bu.role || '') ? 'MANAGER' : bu.role;
    // Worker selection is for non-admin roles only.
    const workers = role === 'MANAGER' ? [] : await this.staffWorkers.getActiveByRole(bu.business.id, role);
    const needsWorkerSelection = role !== 'MANAGER' && workers.length > 0;

    const payload: Record<string, unknown> = {
      sub: user.id,
      email: user.email,
      businessId: bu.business.id,
      businessCode: bu.business.businessId,
      role,
      branchId: bu.branchId || 'main',
    };

    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        language: user.language ?? 'en',
        businessId: bu.business.businessId,
        role,
      },
      forcePasswordChange: (user as any).forcePasswordChange === true,
      needsWorkerSelection,
      workers: needsWorkerSelection ? workers.map((w) => ({ id: w.id, fullName: w.fullName })) : [],
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const current = (currentPassword || '').trim();
    const next = (newPassword || '').trim();
    if (next.length < 6) throw new BadRequestException('Password must be at least 6 characters');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(current, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const hashed = await bcrypt.hash(next, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, forcePasswordChange: false },
    });
    return { success: true };
  }

  /** Select worker after login. Returns new token with worker context. */
  async selectWorker(
    userId: string,
    businessId: string,
    role: string,
    workerId: string,
    businessCode: string,
    branchId: string,
  ) {
    const workers = await this.staffWorkers.getActiveByRole(businessId, role);
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) throw new ForbiddenException('Invalid or inactive worker');

    const payload = {
      sub: userId,
      email: '', // Not needed for subsequent requests
      businessId,
      businessCode,
      role,
      branchId: branchId || 'main',
      workerId: worker.id,
      workerName: worker.fullName,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      worker: { id: worker.id, fullName: worker.fullName },
    };
  }

  /** Create token for user+business (used after business registration - legacy flow) */
  createTokenForBusinessUser(
    bu: { userId: string; businessId: string; role: string; branchId: string | null },
    user: { email: string },
    businessCode: string,
  ) {
    const payload = {
      sub: bu.userId,
      email: user.email,
      businessId: bu.businessId,
      businessCode,
      role: bu.role,
      branchId: bu.branchId || 'main',
    };
    return this.jwtService.sign(payload);
  }

  /** Validate JWT payload - used by JwtStrategy */
  async validateUser(payload: any) {
    // Super Admin tokens do not belong to a business.
    if (payload?.isSuperAdmin === true || payload?.role === 'SUPER_ADMIN') {
      const u = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, isSuperAdmin: true },
      });
      if (!u?.isSuperAdmin) return null;
      return {
        sub: u.id,
        email: u.email,
        role: 'SUPER_ADMIN',
        isSuperAdmin: true,
      };
    }

    const bu = await this.prisma.businessUser.findFirst({
      where: {
        userId: payload.sub,
        businessId: payload.businessId,
        isDisabled: false,
      },
    });
    if (!bu) return null;
    const role = ['ADMIN', 'OWNER'].includes(bu.role || '') ? 'MANAGER' : bu.role;
    return {
      sub: payload.sub,
      email: payload.email,
      businessId: payload.businessId,
      businessCode: payload.businessCode,
      role: role || payload.role || 'MANAGER',
      branchId: bu.branchId || payload.branchId || 'main',
      workerId: payload.workerId ?? null,
      workerName: payload.workerName ?? null,
    };
  }
}

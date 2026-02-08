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
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(password, 10);
    const businessId = await this.generateBusinessCode();

    const [user, business, subscription] = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: email.toLowerCase().trim(),
          password: hashed,
          language: 'en',
        },
        select: { id: true, email: true, language: true },
      });

      const b = await tx.business.create({
        data: {
          businessId,
          businessType: 'HOTEL',
          name: businessName.trim(),
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
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, name: true, language: true, password: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const bu = await this.prisma.businessUser.findFirst({
      where: {
        userId: user.id,
        business: { businessId: businessId.toUpperCase().trim() },
      },
      include: { business: true },
    });
    if (!bu) throw new UnauthorizedException('Invalid business or credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const role = ['ADMIN', 'OWNER'].includes(bu.role || '') ? 'MANAGER' : bu.role;
    const workers = await this.staffWorkers.getActiveByRole(bu.business.id, role);
    const needsWorkerSelection = workers.length > 0;

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
      needsWorkerSelection: needsWorkerSelection && workers.length > 0,
      workers: needsWorkerSelection ? workers.map((w) => ({ id: w.id, fullName: w.fullName })) : [],
    };
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

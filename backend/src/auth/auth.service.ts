import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /** Signup: email + password only. Returns token for business registration step. */
  async signup(email: string, password: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashed,
      },
      select: { id: true, email: true, createdAt: true },
    });

    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: { id: user.id, email: user.email },
      message: 'Account created. Please register a business to continue.',
    };
  }

  /** Login: Business ID + Email + Password. Returns JWT with tenant context. */
  async login(businessId: string, email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
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

    const payload = {
      sub: user.id,
      email: user.email,
      businessId: bu.business.id,
      businessCode: bu.business.businessId,
      role: bu.role,
      branchId: bu.branchId || 'main',
    };

    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessId: bu.business.businessId,
        role: bu.role,
      },
    };
  }

  /** Create token for user+business (used after business registration) */
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
      },
    });
    if (!bu) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      businessId: payload.businessId,
      businessCode: payload.businessCode,
      role: payload.role,
      branchId: payload.branchId || 'main',
    };
  }
}

import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

const ROLES = ['MANAGER', 'FRONT_OFFICE', 'FINANCE', 'HOUSEKEEPING', 'BAR', 'RESTAURANT', 'KITCHEN'] as const;

/** RBAC permissions by role (module access) */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  MANAGER: ['*'],
  FRONT_OFFICE: ['bookings', 'folios', 'rooms', 'housekeeping'],
  FINANCE: ['finance', 'reports'],
  HOUSEKEEPING: ['housekeeping', 'rooms'],
  BAR: ['bar'],
  RESTAURANT: ['restaurant', 'kitchen'],
  KITCHEN: ['restaurant', 'kitchen'],
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private async logAudit(
    userId: string,
    role: string,
    businessId: string,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: object,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          role,
          businessId,
          actionType,
          entityType,
          entityId,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
    } catch {
      /* non-fatal */
    }
  }

  private validatePassword(password: string) {
    const p = (password || '').trim();
    if (p.length < 6) throw new ForbiddenException('Password must be at least 6 characters');
    return p;
  }

  async listUsers(businessId: string, managerId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { businessId: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const bus = await this.prisma.businessUser.findMany({
      where: { businessId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return bus.map((bu) => ({
      id: bu.id,
      userId: bu.userId,
      name: bu.user.name || bu.user.email,
      role: bu.role,
      email: bu.user.email,
      isDisabled: bu.isDisabled,
      createdAt: bu.createdAt,
    }));
  }

  async createRole(
    businessId: string,
    createdBy: string,
    createdByRole: string,
    data: { name: string; role: string; email: string; password: string },
  ) {
    if (!ROLES.includes(data.role as any)) throw new ForbiddenException('Invalid role');
    if (createdByRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can create roles');

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');

    // One role per business - prevent duplicates
    const existingRoleUser = await this.prisma.businessUser.findFirst({
      where: { businessId, role: data.role },
    });
    if (existingRoleUser) {
      throw new ForbiddenException('Role already exists for this business');
    }

    const email = (data.email || '').toLowerCase().trim();
    if (!email) throw new ForbiddenException('Email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ForbiddenException('Invalid email format');

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictException('Email already in use');

    const password = this.validatePassword(data.password);
    const hashedPassword = await bcrypt.hash(password, 10);

    const [user, bu] = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name: data.name || data.role,
          language: 'en',
        },
      });
      const b = await tx.businessUser.create({
        data: {
          userId: u.id,
          businessId,
          role: data.role,
          branchId: 'main',
          createdBy,
        },
        include: { user: { select: { email: true, name: true } } },
      });
      return [u, b];
    });

    await this.logAudit(createdBy, createdByRole, businessId, 'role_created', 'user', user.id, {
      role: data.role,
      email,
    });

    return {
      id: bu.id,
      userId: user.id,
      name: user.name,
      role: bu.role,
      email: user.email,
      isDisabled: false,
    };
  }

  async resetPassword(businessId: string, businessUserId: string, password: string, managerId: string, managerRole: string) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can reset passwords');

    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId },
      include: { user: true },
    });
    if (!bu) throw new NotFoundException('Role not found');

    const nextPassword = this.validatePassword(password);
    const hashedPassword = await bcrypt.hash(nextPassword, 10);

    await this.prisma.user.update({
      where: { id: bu.userId },
      data: { password: hashedPassword },
    });

    await this.logAudit(managerId, managerRole, businessId, 'password_reset', 'user', bu.userId);

    return { success: true };
  }

  async updateRole(
    businessId: string,
    businessUserId: string,
    managerId: string,
    managerRole: string,
    data: { name?: string; role?: string; email?: string },
  ) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can edit roles');
    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId },
      include: { user: true },
    });
    if (!bu) throw new NotFoundException('Role not found');
    const updates: { name?: string; email?: string } = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.email !== undefined) {
      const email = data.email.toLowerCase().trim();
      if (!email) throw new ForbiddenException('Email is required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ForbiddenException('Invalid email format');
      const existing = await this.prisma.user.findFirst({
        where: { email, id: { not: bu.userId } },
      });
      if (existing) throw new ConflictException('Email already in use');
      updates.email = email;
    }
    if (Object.keys(updates).length > 0) {
      await this.prisma.user.update({ where: { id: bu.userId }, data: updates });
    }
    if (data.role !== undefined && ROLES.includes(data.role as any)) {
      await this.prisma.businessUser.update({
        where: { id: businessUserId },
        data: { role: data.role },
      });
    }
    await this.logAudit(managerId, managerRole, businessId, 'role_updated', 'user', bu.userId, data);
    return this.listUsers(businessId, managerId).then((list) => list.find((u) => u.id === businessUserId));
  }

  async deleteRole(businessId: string, businessUserId: string, managerId: string, managerRole: string) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can delete roles');
    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId },
    });
    if (!bu) throw new NotFoundException('Role not found');
    if (bu.userId === managerId) throw new ForbiddenException('Cannot delete yourself');
    await this.prisma.businessUser.delete({ where: { id: businessUserId } });
    await this.logAudit(managerId, managerRole, businessId, 'user_deleted', 'user', bu.userId);
    return { success: true };
  }

  async setDisabled(businessId: string, businessUserId: string, disabled: boolean, managerId: string, managerRole: string) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can activate/deactivate roles');

    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId },
    });
    if (!bu) throw new NotFoundException('Role not found');
    if (bu.userId === managerId) throw new ForbiddenException('Cannot disable yourself');

    await this.prisma.businessUser.update({
      where: { id: businessUserId },
      data: { isDisabled: disabled },
    });

    await this.logAudit(managerId, managerRole, businessId, disabled ? 'user_disabled' : 'user_enabled', 'user', bu.userId);
    return { isDisabled: disabled };
  }
}

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
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

  /** Generate unique system email: role+random@businesscode.hms.local */
  private async generateSystemEmail(role: string, businessCode: string): Promise<string> {
    const slug = businessCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12) || 'biz';
    const rand = Math.random().toString(36).slice(2, 8);
    const local = `${role.toLowerCase()}+${rand}`;
    const email = `${local}@${slug}.hms.local`;
    const exists = await this.prisma.user.findUnique({ where: { email } });
    return exists ? this.generateSystemEmail(role, businessCode + rand) : email;
  }

  /** Generate random temporary password (8 chars) */
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

  async createUser(
    businessId: string,
    createdBy: string,
    createdByRole: string,
    data: { fullName: string; role: string },
  ) {
    if (!ROLES.includes(data.role as any)) throw new ForbiddenException('Invalid role');
    if (createdByRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can create users');

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');

    const email = await this.generateSystemEmail(data.role, business.businessId);
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const [user, bu] = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name: data.fullName,
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

    await this.logAudit(createdBy, createdByRole, businessId, 'user_created', 'user', user.id, {
      role: data.role,
      email,
    });

    return {
      id: bu.id,
      userId: user.id,
      name: user.name,
      role: bu.role,
      email: user.email,
      temporaryPassword: tempPassword,
      isDisabled: false,
    };
  }

  async resetPassword(businessId: string, businessUserId: string, managerId: string, managerRole: string) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can reset passwords');

    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId },
      include: { user: true },
    });
    if (!bu) throw new NotFoundException('User not found');

    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await this.prisma.user.update({
      where: { id: bu.userId },
      data: { password: hashedPassword },
    });

    await this.logAudit(managerId, managerRole, businessId, 'password_reset', 'user', bu.userId);

    return { temporaryPassword: tempPassword };
  }

  async updateUser(
    businessId: string,
    businessUserId: string,
    managerId: string,
    managerRole: string,
    data: { fullName?: string; role?: string },
  ) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can edit users');
    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId },
      include: { user: true },
    });
    if (!bu) throw new NotFoundException('User not found');
    const updates: { name?: string } = {};
    if (data.fullName !== undefined) updates.name = data.fullName.trim();
    if (Object.keys(updates).length > 0) {
      await this.prisma.user.update({ where: { id: bu.userId }, data: updates });
    }
    if (data.role !== undefined && ROLES.includes(data.role as any)) {
      await this.prisma.businessUser.update({
        where: { id: businessUserId },
        data: { role: data.role },
      });
    }
    await this.logAudit(managerId, managerRole, businessId, 'user_updated', 'user', bu.userId, data);
    return this.listUsers(businessId, managerId).then((list) => list.find((u) => u.id === businessUserId));
  }

  async deleteUser(businessId: string, businessUserId: string, managerId: string, managerRole: string) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can delete users');
    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId },
    });
    if (!bu) throw new NotFoundException('User not found');
    if (bu.userId === managerId) throw new ForbiddenException('Cannot delete yourself');
    await this.prisma.businessUser.delete({ where: { id: businessUserId } });
    await this.logAudit(managerId, managerRole, businessId, 'user_deleted', 'user', bu.userId);
    return { success: true };
  }

  async setDisabled(businessId: string, businessUserId: string, disabled: boolean, managerId: string, managerRole: string) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can disable users');

    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId },
    });
    if (!bu) throw new NotFoundException('User not found');
    if (bu.userId === managerId) throw new ForbiddenException('Cannot disable yourself');

    await this.prisma.businessUser.update({
      where: { id: businessUserId },
      data: { isDisabled: disabled },
    });

    await this.logAudit(managerId, managerRole, businessId, disabled ? 'user_disabled' : 'user_enabled', 'user', bu.userId);
    return { isDisabled: disabled };
  }
}

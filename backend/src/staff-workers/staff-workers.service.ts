import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ROLES = ['MANAGER', 'FRONT_OFFICE', 'FINANCE', 'HOUSEKEEPING', 'BAR', 'RESTAURANT', 'KITCHEN'] as const;

@Injectable()
export class StaffWorkersService {
  constructor(private prisma: PrismaService) {}

  /** List workers by business, optionally filter by role. MANAGER only. */
  async list(businessId: string, role?: string) {
    const where: { businessId: string; role?: string } = { businessId };
    if (role) where.role = role;
    return this.prisma.staffWorker.findMany({
      where,
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  /** Get active workers for a role (used at login for worker selection). */
  async getActiveByRole(businessId: string, role: string) {
    return this.prisma.staffWorker.findMany({
      where: { businessId, role, status: 'ACTIVE' },
      orderBy: { fullName: 'asc' },
    });
  }

  private async logAudit(
    userId: string,
    role: string,
    businessId: string,
    actionType: string,
    entityType: string,
    entityId: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: { userId, role, businessId, actionType, entityType, entityId },
      });
    } catch {
      /* non-fatal */
    }
  }

  /** Create worker. MANAGER only. */
  async create(
    businessId: string,
    data: { fullName: string; role: string },
    createdBy: string,
    createdByRole: string,
  ) {
    if (createdByRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can create workers');
    if (!ROLES.includes(data.role as (typeof ROLES)[number]))
      throw new ForbiddenException('Invalid role');

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');

    const w = await this.prisma.staffWorker.create({
      data: {
        businessId,
        role: data.role,
        fullName: data.fullName.trim(),
        status: 'ACTIVE',
        createdBy,
      },
    });
    await this.logAudit(createdBy, createdByRole, businessId, 'staff_worker_created', 'staff_worker', w.id);
    return w;
  }

  /** Block or unblock worker. MANAGER only. */
  async setStatus(
    businessId: string,
    workerId: string,
    status: 'ACTIVE' | 'BLOCKED',
    managerId: string,
    managerRole: string,
  ) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can block workers');

    const w = await this.prisma.staffWorker.findFirst({
      where: { id: workerId, businessId },
    });
    if (!w) throw new NotFoundException('Worker not found');

    const w = await this.prisma.staffWorker.update({
      where: { id: workerId },
      data: { status },
    });
    await this.logAudit(managerId, managerRole, businessId, `staff_worker_${status.toLowerCase()}`, 'staff_worker', workerId);
    return w;
  }

  /** Move worker to another role. MANAGER only. */
  async moveRole(
    businessId: string,
    workerId: string,
    newRole: string,
    managerId: string,
    managerRole: string,
  ) {
    if (managerRole !== 'MANAGER') throw new ForbiddenException('Only MANAGER can move workers');
    if (!ROLES.includes(newRole as (typeof ROLES)[number]))
      throw new ForbiddenException('Invalid role');

    const w = await this.prisma.staffWorker.findFirst({
      where: { id: workerId, businessId },
    });
    if (!w) throw new NotFoundException('Worker not found');

    const w = await this.prisma.staffWorker.update({
      where: { id: workerId },
      data: { role: newRole },
    });
    await this.logAudit(managerId, managerRole, businessId, 'staff_worker_role_changed', 'staff_worker', workerId);
    return w;
  }

  /** Get worker activity logs. MANAGER only. */
  async getActivityLogs(businessId: string, workerId?: string, limit = 100) {
    const where = workerId
      ? { businessId, workerId }
      : { businessId, workerId: { not: null } as const };

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map((l) => ({
      id: l.id,
      role: l.role,
      workerId: l.workerId,
      workerName: l.workerName,
      actionType: l.actionType,
      entityType: l.entityType,
      entityId: l.entityId,
      metadata: l.metadata,
      createdAt: l.createdAt,
    }));
  }
}

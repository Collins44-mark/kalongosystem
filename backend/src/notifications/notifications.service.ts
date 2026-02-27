import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MANAGER_LEVEL_ROLES = ['MANAGER', 'ADMIN', 'OWNER'];

function isManagerLevel(role: string | null | undefined): boolean {
  if (!role) return false;
  return MANAGER_LEVEL_ROLES.includes(role.toString().trim().toUpperCase());
}

export type CreateAdminAlertInput = {
  businessId: string;
  type: 'MAINTENANCE_REQUEST' | 'LAUNDRY_REQUEST' | 'ROLE_MESSAGE';
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  senderRole: string;
  senderId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create an admin alert when a non-admin role creates a request or message.
   * Do NOT call when the actor is MANAGER/ADMIN/OWNER - no self-notifications.
   */
  async createAdminAlertIfNeeded(
    input: CreateAdminAlertInput,
    actorRole: string | null | undefined,
  ): Promise<void> {
    if (isManagerLevel(actorRole)) return;
    await this.prisma.adminAlert.create({
      data: {
        businessId: input.businessId,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        senderRole: input.senderRole,
        senderId: input.senderId ?? null,
      },
    });
  }

  async getAlertsForAdmin(businessId: string, userId: string, limit = 50) {
    const alerts = await this.prisma.adminAlert.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const readIds = await this.prisma.adminAlertRead.findMany({
      where: { userId, alertId: { in: alerts.map((a) => a.id) } },
      select: { alertId: true },
    });
    const readSet = new Set(readIds.map((r) => r.alertId));
    return alerts.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message,
      entityType: a.entityType,
      entityId: a.entityId,
      senderRole: a.senderRole,
      createdAt: a.createdAt,
      read: readSet.has(a.id),
    }));
  }

  async getUnreadCount(businessId: string, userId: string): Promise<number> {
    const alerts = await this.prisma.adminAlert.findMany({
      where: { businessId },
      select: { id: true },
    });
    if (alerts.length === 0) return 0;
    const readCount = await this.prisma.adminAlertRead.count({
      where: { userId, alertId: { in: alerts.map((a) => a.id) } },
    });
    return alerts.length - readCount;
  }

  async markAllAsRead(businessId: string, userId: string): Promise<void> {
    const alerts = await this.prisma.adminAlert.findMany({
      where: { businessId },
      select: { id: true },
    });
    if (alerts.length === 0) return;
    await this.prisma.$transaction(
      alerts.map((a) =>
        this.prisma.adminAlertRead.upsert({
          where: {
            alertId_userId: { alertId: a.id, userId },
          },
          create: { alertId: a.id, userId },
          update: {},
        }),
      ),
    );
  }
}

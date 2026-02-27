import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class HousekeepingService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Get all rooms with cleaning logs */
  async getRooms(businessId: string, branchId: string) {
    const branch = branchId || 'main';
    return this.prisma.room.findMany({
      where: { businessId, branchId: branch },
      include: {
        category: true,
        cleaningLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { roomNumber: 'asc' },
    });
  }

  /** Update cleaning task status - Housekeeping: marks room as cleaned */
  async updateCleaningStatus(
    businessId: string,
    branchId: string,
    roomId: string,
    status: string,
    actor: { workerId?: string | null; workerName?: string | null },
  ) {
    const valid = ['COMPLETED'];
    if (!valid.includes(status)) throw new BadRequestException('Invalid status');
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, businessId, branchId },
    });
    if (!room) throw new ForbiddenException('Room not found');
    if (room.status !== 'UNDER_MAINTENANCE') {
      throw new BadRequestException('Room is not under maintenance');
    }
    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: roomId, businessId },
        data: { status: 'VACANT' },
      }),
      this.prisma.roomCleaningLog.create({
        data: {
          businessId,
          branchId: branchId || 'main',
          roomId,
          cleanedByWorkerId: actor.workerId ?? null,
          cleanedByWorkerName: actor.workerName ?? null,
        },
      }),
    ]);
    return this.prisma.room.findFirst({ where: { id: roomId }, include: { category: true } });
  }

  /** Update laundry task status - Housekeeping */
  async updateLaundryStatus(businessId: string, requestId: string, status: string) {
    const valid = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];
    if (!valid.includes(status)) throw new BadRequestException('Invalid status');
    return this.prisma.laundryRequest.update({
      where: { id: requestId, businessId },
      data: { status },
    });
  }

  /** Mark room as cleaned - legacy: Housekeeping marks Completed (same as updateCleaningStatus COMPLETED) */
  async markAsCleaned(
    businessId: string,
    branchId: string,
    roomId: string,
    actor: { userId: string; workerId?: string | null; workerName?: string | null },
  ) {
    return this.updateCleaningStatus(businessId, branchId, roomId, 'COMPLETED', actor);
  }

  /** Get cleaning logs - newest first */
  async getCleaningLogs(businessId: string, branchId: string, limit = 100) {
    return this.prisma.roomCleaningLog.findMany({
      where: { businessId, branchId },
      include: { room: { select: { roomNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Update room status - Admin only */
  async updateRoomStatus(
    businessId: string,
    roomId: string,
    status: string,
    actor?: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
    _extra?: { maintenanceReason?: string; maintenanceEstimatedAt?: string },
  ) {
    const valid = ['VACANT', 'OCCUPIED', 'RESERVED', 'UNDER_MAINTENANCE'];
    if (!valid.includes(status)) throw new ForbiddenException('Invalid room status');
    const room = await this.prisma.room.findFirst({ where: { id: roomId, businessId } });
    if (!room) throw new ForbiddenException('Room not found');
    const res = await this.prisma.room.update({
      where: { id: roomId, businessId },
      data: { status },
    });
    if (actor?.userId) {
      try {
        await this.prisma.auditLog.create({
          data: {
            userId: actor.userId,
            role: actor.role,
            businessId,
            workerId: actor.workerId ?? null,
            workerName: actor.workerName ?? null,
            actionType: 'room_status_updated',
            entityType: 'room',
            entityId: roomId,
            metadata: JSON.stringify({ status }),
          },
        });
      } catch {
        // ignore
      }
    }
    return res;
  }

  async submitRequest(
    businessId: string,
    branchId: string,
    data: { roomId?: string; description: string; type: string; amount?: number },
    createdBy: string,
    actorRole?: string | null,
  ) {
    const req = await this.prisma.maintenanceRequest.create({
      data: {
        businessId,
        branchId,
        roomId: data.roomId,
        description: data.description,
        type: data.type,
        amount: data.amount != null ? new Decimal(data.amount) : null,
        status: 'PENDING',
        createdBy,
      },
    });
    await this.notifications.createAdminAlertIfNeeded(
      {
        businessId,
        type: 'MAINTENANCE_REQUEST',
        title: 'Maintenance request',
        message: data.description,
        entityType: 'maintenance_request',
        entityId: req.id,
        senderRole: actorRole ?? 'HOUSEKEEPING',
        senderId: createdBy,
      },
      actorRole,
    );
    return req;
  }

  async getRequests(businessId: string, branchId: string) {
    return this.prisma.maintenanceRequest.findMany({
      where: { businessId, branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateRequestStatus(businessId: string, requestId: string, status: string) {
    const valid = ['PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED'];
    if (!valid.includes(status)) throw new BadRequestException('Invalid status');
    return this.prisma.maintenanceRequest.update({
      where: { id: requestId, businessId },
      data: { status },
    });
  }

  async approveRequest(businessId: string, requestId: string) {
    return this.prisma.maintenanceRequest.update({
      where: { id: requestId, businessId },
      data: { status: 'APPROVED' },
    });
  }

  async rejectRequest(businessId: string, requestId: string) {
    return this.prisma.maintenanceRequest.update({
      where: { id: requestId, businessId },
      data: { status: 'REJECTED' },
    });
  }

  async createLaundryRequest(
    businessId: string,
    branchId: string,
    data: { roomNumber?: string; item: string; quantity: number },
    actor: { workerId?: string | null; workerName?: string | null; role?: string | null },
  ) {
    const req = await this.prisma.laundryRequest.create({
      data: {
        businessId,
        branchId,
        roomNumber: data.roomNumber ?? null,
        item: data.item.trim(),
        quantity: data.quantity || 1,
        status: 'REQUESTED',
        createdByWorkerId: actor.workerId ?? null,
        createdByWorkerName: actor.workerName ?? null,
      },
    });
    await this.notifications.createAdminAlertIfNeeded(
      {
        businessId,
        type: 'LAUNDRY_REQUEST',
        title: 'Laundry request',
        message: `${data.item} x ${data.quantity}${data.roomNumber ? ` (Room ${data.roomNumber})` : ''}`,
        entityType: 'laundry_request',
        entityId: req.id,
        senderRole: actor.role ?? 'HOUSEKEEPING',
        senderId: actor.workerId ?? null,
      },
      actor.role,
    );
    return req;
  }

  async approveLaundry(businessId: string, requestId: string) {
    return this.prisma.laundryRequest.update({
      where: { id: requestId, businessId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
  }

  async markLaundryDelivered(businessId: string, requestId: string) {
    return this.prisma.laundryRequest.update({
      where: { id: requestId, businessId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
  }

  async getLaundryRequests(businessId: string, branchId: string, limit = 100) {
    return this.prisma.laundryRequest.findMany({
      where: { businessId, branchId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

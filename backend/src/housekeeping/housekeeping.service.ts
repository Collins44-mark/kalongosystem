import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class HousekeepingService {
  constructor(private prisma: PrismaService) {}

  /** Get all rooms - both Housekeeping and Admin see full grid */
  async getRooms(businessId: string, branchId: string) {
    return this.prisma.room.findMany({
      where: { businessId, branchId },
      include: {
        category: true,
        cleaningLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        cleaningAssignedToWorker: { select: { id: true, fullName: true } },
        cleaningAssignedByWorker: { select: { id: true, fullName: true } },
      },
      orderBy: { roomNumber: 'asc' },
    });
  }

  /** Get assignable staff (HOUSEKEEPING role) for cleaning/laundry assignment */
  async getAssignableStaff(businessId: string) {
    return this.prisma.staffWorker.findMany({
      where: { businessId, role: 'HOUSEKEEPING', status: 'ACTIVE' },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  /** Assign cleaning to a worker */
  async assignCleaning(
    businessId: string,
    branchId: string,
    roomId: string,
    workerId: string,
    actor: { workerId?: string | null; workerName?: string | null },
  ) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, businessId, branchId },
    });
    if (!room) throw new ForbiddenException('Room not found');
    const worker = await this.prisma.staffWorker.findFirst({
      where: { id: workerId, businessId, role: 'HOUSEKEEPING', status: 'ACTIVE' },
    });
    if (!worker) throw new BadRequestException('Invalid staff member');
    return this.prisma.room.update({
      where: { id: roomId, businessId },
      data: {
        cleaningAssignedToWorkerId: workerId,
        cleaningAssignedAt: new Date(),
        cleaningAssignedByWorkerId: actor.workerId ?? null,
      },
      include: { category: true, cleaningAssignedToWorker: { select: { id: true, fullName: true } } },
    });
  }

  /** Assign laundry to a worker */
  async assignLaundry(
    businessId: string,
    requestId: string,
    workerId: string,
    actor: { workerId?: string | null; workerName?: string | null },
  ) {
    const worker = await this.prisma.staffWorker.findFirst({
      where: { id: workerId, businessId, role: 'HOUSEKEEPING', status: 'ACTIVE' },
    });
    if (!worker) throw new BadRequestException('Invalid staff member');
    return this.prisma.laundryRequest.update({
      where: { id: requestId, businessId },
      data: {
        assignedToWorkerId: workerId,
        assignedByWorkerId: actor.workerId ?? null,
        assignedAt: new Date(),
      },
    });
  }

  /** Mark room as cleaned - sets status to VACANT + creates log. Only for UNDER_MAINTENANCE (needs cleaning). */
  async markAsCleaned(
    businessId: string,
    branchId: string,
    roomId: string,
    actor: { userId: string; workerId?: string | null; workerName?: string | null },
  ) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, businessId, branchId },
    });
    if (!room) throw new ForbiddenException('Room not found');
    if (room.status !== 'UNDER_MAINTENANCE') {
      throw new ForbiddenException('Only rooms under maintenance (needs cleaning) can be marked as cleaned');
    }
    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: roomId },
        data: { status: 'VACANT' },
      }),
      this.prisma.roomCleaningLog.create({
        data: {
          businessId,
          branchId,
          roomId,
          cleanedByWorkerId: actor.workerId ?? null,
          cleanedByWorkerName: actor.workerName ?? null,
        },
      }),
    ]);
    return this.prisma.room.findFirst({ where: { id: roomId }, include: { category: true } });
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

  /** Update room status - Admin only. Full override: VACANT, OCCUPIED, RESERVED, UNDER_MAINTENANCE. */
  async updateRoomStatus(
    businessId: string,
    roomId: string,
    status: string,
    actor?: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
    extra?: { maintenanceReason?: string; maintenanceEstimatedAt?: string },
  ) {
    const valid = ['VACANT', 'OCCUPIED', 'RESERVED', 'UNDER_MAINTENANCE'];
    if (!valid.includes(status)) {
      throw new ForbiddenException('Invalid room status');
    }
    const room = await this.prisma.room.findFirst({ where: { id: roomId, businessId } });
    if (!room) throw new ForbiddenException('Room not found');
    if (status === 'UNDER_MAINTENANCE') {
      const reason = extra?.maintenanceReason?.trim();
      if (!reason) {
        throw new BadRequestException('Reason is required when setting room to Under Maintenance');
      }
    }
    const data: Record<string, unknown> = { status };
    if (status === 'UNDER_MAINTENANCE' && extra) {
      data.maintenanceReason = extra.maintenanceReason?.trim() ?? null;
      data.maintenanceEstimatedAt = extra.maintenanceEstimatedAt
        ? new Date(extra.maintenanceEstimatedAt)
        : null;
    } else {
      data.maintenanceReason = null;
      data.maintenanceEstimatedAt = null;
    }
    const res = await this.prisma.room.update({
      where: { id: roomId, businessId },
      data: data as Record<string, unknown>,
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
        // ignore audit failures
      }
    }
    return res;
  }

  /** Submit maintenance or expense request - housekeeping cannot approve */
  async submitRequest(
    businessId: string,
    branchId: string,
    data: {
      roomId?: string;
      description: string;
      type: string;
      amount?: number;
    },
    createdBy: string,
  ) {
    return this.prisma.maintenanceRequest.create({
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
  }

  async getRequests(businessId: string, branchId: string) {
    return this.prisma.maintenanceRequest.findMany({
      where: { businessId, branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateRequestStatus(businessId: string, requestId: string, status: string) {
    const valid = ['PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED'];
    if (!valid.includes(status)) {
      throw new BadRequestException('Invalid status');
    }
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

  /** Laundry: create request */
  async createLaundryRequest(
    businessId: string,
    branchId: string,
    data: { roomNumber?: string; item: string; quantity: number },
    actor: { workerId?: string | null; workerName?: string | null },
  ) {
    return this.prisma.laundryRequest.create({
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
  }

  /** Laundry: approve (Admin only) */
  async approveLaundry(businessId: string, requestId: string) {
    return this.prisma.laundryRequest.update({
      where: { id: requestId, businessId },
      data: { status: 'APPROVED' },
    });
  }

  /** Laundry: mark as delivered (Admin only) */
  async markLaundryDelivered(businessId: string, requestId: string) {
    return this.prisma.laundryRequest.update({
      where: { id: requestId, businessId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
  }

  /** Laundry: list all - newest first */
  async getLaundryRequests(businessId: string, branchId: string, limit = 100) {
    return this.prisma.laundryRequest.findMany({
      where: { businessId, branchId },
      include: {
        assignedToWorker: { select: { id: true, fullName: true } },
        assignedByWorker: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class HousekeepingService {
  constructor(private prisma: PrismaService) {}

  /** Get rooms for housekeeping staff: recently checked-out (UNDER_MAINTENANCE) OR vacant not cleaned today */
  async getRoomsForStaff(businessId: string, branchId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const rooms = await this.prisma.room.findMany({
      where: { businessId, branchId },
      include: {
        category: true,
        cleaningLogs: {
          where: { createdAt: { gte: todayStart, lte: todayEnd } },
          take: 1,
        },
      },
      orderBy: { roomNumber: 'asc' },
    });

    const filtered = rooms.filter((r) => {
      if (r.status === 'UNDER_MAINTENANCE') return true;
      if (r.status === 'VACANT' && r.cleaningLogs.length === 0) return true;
      return false;
    });
    return filtered.map(({ cleaningLogs, ...r }) => r);
  }

  /** Get all rooms for admin */
  async getRooms(businessId: string, branchId: string) {
    return this.prisma.room.findMany({
      where: { businessId, branchId },
      include: {
        category: true,
        cleaningLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { roomNumber: 'asc' },
    });
  }

  /** Mark room as cleaned - creates log only, does NOT change room status */
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
    if (room.status !== 'VACANT' && room.status !== 'UNDER_MAINTENANCE') {
      throw new ForbiddenException('Only vacant or under-maintenance rooms can be marked as cleaned');
    }
    return this.prisma.roomCleaningLog.create({
      data: {
        businessId,
        branchId,
        roomId,
        cleanedByWorkerId: actor.workerId ?? null,
        cleanedByWorkerName: actor.workerName ?? null,
      },
    });
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

  /** Update room status - MANAGER only. Only VACANT <-> UNDER_MAINTENANCE allowed (maintenance toggle). */
  async updateRoomStatus(
    businessId: string,
    roomId: string,
    status: string,
    actor?: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
  ) {
    const valid = ['VACANT', 'UNDER_MAINTENANCE'];
    if (!valid.includes(status)) {
      throw new ForbiddenException('Admin can only toggle maintenance (VACANT/UNDER_MAINTENANCE). Occupied/Reserved follow system logic.');
    }
    const room = await this.prisma.room.findFirst({ where: { id: roomId, businessId } });
    if (!room) throw new ForbiddenException('Room not found');
    if (!valid.includes(room.status)) {
      throw new ForbiddenException('Cannot change status of occupied or reserved rooms');
    }
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
}

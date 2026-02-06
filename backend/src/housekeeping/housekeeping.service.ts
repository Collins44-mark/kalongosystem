import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class HousekeepingService {
  constructor(private prisma: PrismaService) {}

  /** Get rooms for housekeeping - room status updates */
  async getRooms(businessId: string, branchId: string) {
    return this.prisma.room.findMany({
      where: { businessId, branchId },
      include: { category: true },
      orderBy: { roomNumber: 'asc' },
    });
  }

  /** Update room cleaning status - e.g. mark as cleaned */
  async updateRoomStatus(
    businessId: string,
    roomId: string,
    status: string,
  ) {
    return this.prisma.room.update({
      where: { id: roomId, businessId },
      data: { status },
    });
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

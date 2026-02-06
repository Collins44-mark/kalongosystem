import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class HotelService {
  constructor(private prisma: PrismaService) {}

  // Room Categories
  async createCategory(
    businessId: string,
    branchId: string,
    data: { name: string; pricePerNight: number; description?: string },
    createdBy: string,
  ) {
    return this.prisma.roomCategory.create({
      data: {
        businessId,
        branchId,
        name: data.name,
        pricePerNight: new Decimal(data.pricePerNight),
        description: data.description,
        createdBy,
      },
    });
  }

  async getCategories(businessId: string, branchId: string) {
    return this.prisma.roomCategory.findMany({
      where: { businessId, branchId },
      include: { rooms: true },
    });
  }

  // Rooms
  async createRoom(
    businessId: string,
    branchId: string,
    data: { categoryId: string; roomNumber: string },
    createdBy: string,
  ) {
    return this.prisma.room.create({
      data: {
        businessId,
        branchId,
        categoryId: data.categoryId,
        roomNumber: data.roomNumber,
        status: 'VACANT',
        createdBy,
      },
    });
  }

  async getRooms(businessId: string, branchId: string) {
    return this.prisma.room.findMany({
      where: { businessId, branchId },
      include: { category: true },
    });
  }

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

  // Bookings
  async createBooking(
    businessId: string,
    branchId: string,
    data: {
      roomId: string;
      guestName: string;
      guestPhone?: string;
      checkIn: Date;
      checkOut: Date;
      nights: number;
    },
    createdBy: string,
  ) {
    const room = await this.prisma.room.findFirst({
      where: { id: data.roomId, businessId },
      include: { category: true },
    });
    if (!room) throw new NotFoundException('Room not found');

    const totalAmount = Number(room.category.pricePerNight) * data.nights;
    const folioNumber = `FOL-${Date.now()}`;

    const booking = await this.prisma.booking.create({
      data: {
        businessId,
        branchId,
        roomId: data.roomId,
        guestName: data.guestName,
        guestPhone: data.guestPhone,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        nights: data.nights,
        totalAmount: new Decimal(totalAmount),
        status: 'CONFIRMED',
        folioNumber,
        createdBy,
      },
      include: { room: { include: { category: true } } },
    });

    await this.prisma.room.update({
      where: { id: data.roomId },
      data: { status: 'RESERVED' },
    });

    return booking;
  }

  async getBookings(businessId: string, branchId: string) {
    return this.prisma.booking.findMany({
      where: { businessId, branchId },
      include: { room: { include: { category: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkIn(bookingId: string, businessId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
    });
    if (!b) throw new NotFoundException('Booking not found');

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_IN' },
    });
    await this.prisma.room.update({
      where: { id: b.roomId },
      data: { status: 'OCCUPIED' },
    });
    return { message: 'Checked in' };
  }

  async checkOut(bookingId: string, businessId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
    });
    if (!b) throw new NotFoundException('Booking not found');

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_OUT' },
    });
    await this.prisma.room.update({
      where: { id: b.roomId },
      data: { status: 'VACANT' },
    });
    return { message: 'Checked out' };
  }

  async getRoomSummary(businessId: string, branchId: string) {
    const rooms = await this.prisma.room.findMany({
      where: { businessId, branchId },
    });
    const total = rooms.length;
    const occupied = rooms.filter((r) => r.status === 'OCCUPIED').length;
    const vacant = rooms.filter((r) => r.status === 'VACANT').length;
    const reserved = rooms.filter((r) => r.status === 'RESERVED').length;
    const underMaintenance = rooms.filter(
      (r) => r.status === 'UNDER_MAINTENANCE',
    ).length;
    return { total, occupied, vacant, reserved, underMaintenance };
  }
}

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

  async getBookings(
    businessId: string,
    branchId: string,
    opts?: { scope?: 'all' | 'today' | 'mine'; userId?: string },
  ) {
    const where: Record<string, unknown> = { businessId, branchId };
    if (opts?.scope === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.OR = [
        { checkIn: { gte: today, lt: tomorrow } },
        { checkOut: { gte: today, lt: tomorrow } },
        { status: 'CHECKED_IN', checkIn: { lte: today }, checkOut: { gte: today } },
      ];
    } else if (opts?.scope === 'mine' && opts?.userId) {
      where.createdBy = opts.userId;
    }
    const bookings = await this.prisma.booking.findMany({
      where,
      include: { room: { include: { category: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const creatorIds = [...new Set(bookings.map((b) => b.createdBy).filter(Boolean) as string[])];
    const users = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.email]));
    return bookings.map((b) => ({
      ...b,
      servedBy: b.createdBy ? userMap.get(b.createdBy) ?? b.createdBy : null,
    }));
  }

  async cancelBooking(bookingId: string, businessId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
    });
    if (!b) throw new NotFoundException('Booking not found');
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });
    if (b.status === 'CONFIRMED' || b.status === 'RESERVED') {
      await this.prisma.room.update({
        where: { id: b.roomId },
        data: { status: 'VACANT' },
      });
    }
    return { message: 'Booking cancelled' };
  }

  async changeRoom(bookingId: string, businessId: string, newRoomId: string, userId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      include: { room: true },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'CONFIRMED' && b.status !== 'CHECKED_IN') {
      throw new NotFoundException('Cannot change room for this booking status');
    }
    const newRoom = await this.prisma.room.findFirst({
      where: { id: newRoomId, businessId },
    });
    if (!newRoom) throw new NotFoundException('Room not found');
    if (newRoom.status !== 'VACANT') {
      throw new NotFoundException('Room is not available');
    }
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { roomId: newRoomId },
    });
    await this.prisma.room.update({
      where: { id: b.roomId },
      data: { status: 'VACANT' },
    });
    await this.prisma.room.update({
      where: { id: newRoomId },
      data: { status: b.status === 'CHECKED_IN' ? 'OCCUPIED' : 'RESERVED' },
    });
    return { message: 'Room changed' };
  }

  async extendStay(bookingId: string, businessId: string, newCheckOut: Date) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      include: { room: { include: { category: true } } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'CHECKED_IN') {
      throw new NotFoundException('Can only extend checked-in bookings');
    }
    const checkOut = new Date(b.checkOut);
    if (newCheckOut <= checkOut) {
      throw new NotFoundException('New check-out must be after current check-out');
    }
    const nights = Math.ceil((newCheckOut.getTime() - new Date(b.checkIn).getTime()) / (1000 * 60 * 60 * 24));
    const totalAmount = Number(b.room.category.pricePerNight) * nights;
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { checkOut: newCheckOut, nights, totalAmount: new Decimal(totalAmount) },
    });
    return { message: 'Stay extended' };
  }

  async checkIn(bookingId: string, businessId: string, userId?: string) {
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

  async overrideStatus(bookingId: string, businessId: string, status: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
    });
    if (!b) throw new NotFoundException('Booking not found');
    const valid = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];
    if (!valid.includes(status)) throw new NotFoundException('Invalid status');
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });
    if (status === 'CANCELLED' && (b.status === 'CONFIRMED' || b.status === 'RESERVED')) {
      await this.prisma.room.update({
        where: { id: b.roomId },
        data: { status: 'VACANT' },
      });
    } else if (status === 'CHECKED_IN') {
      await this.prisma.room.update({
        where: { id: b.roomId },
        data: { status: 'OCCUPIED' },
      });
    } else if (status === 'CHECKED_OUT') {
      await this.prisma.room.update({
        where: { id: b.roomId },
        data: { status: 'VACANT' },
      });
    }
    return { message: 'Status updated' };
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

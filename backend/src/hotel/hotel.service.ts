import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { isManagerLevel } from '../common/utils/roles';
import { AccountingService } from '../accounting/accounting.service';

const PAYMENT_MODES = ['CASH', 'BANK', 'MPESA', 'TIGOPESA', 'AIRTEL_MONEY'] as const;

@Injectable()
export class HotelService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  private computePaymentSummary(totalAmount: Decimal, payments: { amount: Decimal }[]) {
    const total = Number(totalAmount);
    const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const balance = Math.max(0, total - paid);
    const paymentStatus =
      paid <= 0
        ? 'UNPAID'
        : balance <= 0
          ? 'FULLY_PAID'
          : 'PARTIALLY_PAID';
    return {
      paidAmount: paid,
      balance,
      paymentStatus,
    };
  }

  async logAudit(
    userId: string,
    role: string,
    businessId: string,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: object,
    worker?: { workerId: string; workerName: string },
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          role,
          businessId,
          workerId: worker?.workerId ?? null,
          workerName: worker?.workerName ?? null,
          actionType,
          entityType,
          entityId,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
    } catch {
      // Non-fatal: log failures should not break operations
    }
  }

  // Room Categories
  async createCategory(
    businessId: string,
    branchId: string,
    data: { name: string; pricePerNight: number; description?: string },
    createdBy: string,
  ) {
    const cat = await this.prisma.roomCategory.create({
      data: {
        businessId,
        branchId,
        name: data.name,
        pricePerNight: new Decimal(data.pricePerNight),
        description: data.description,
        createdBy,
      },
    });
    return cat;
  }

  async updateCategory(
    businessId: string,
    categoryId: string,
    data: { name?: string; pricePerNight?: number },
  ) {
    const cat = await this.prisma.roomCategory.findFirst({
      where: { id: categoryId, businessId },
    });
    if (!cat) throw new NotFoundException('Category not found');
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.pricePerNight !== undefined) updateData.pricePerNight = new Decimal(data.pricePerNight);
    return this.prisma.roomCategory.update({
      where: { id: categoryId },
      data: updateData,
    });
  }

  async deleteCategory(businessId: string, categoryId: string) {
    const cat = await this.prisma.roomCategory.findFirst({
      where: { id: categoryId, businessId },
      include: { rooms: true },
    });
    if (!cat) throw new NotFoundException('Category not found');
    if (cat.rooms.length > 0) {
      throw new NotFoundException('Delete all rooms in this category first');
    }
    await this.prisma.roomCategory.delete({ where: { id: categoryId } });
    return { success: true };
  }

  async getCategories(businessId: string, branchId?: string) {
    const where: { businessId: string; branchId?: string } = { businessId };
    if (branchId) where.branchId = branchId;
    const categories = await this.prisma.roomCategory.findMany({
      where,
      include: { rooms: true },
      orderBy: { name: 'asc' },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      pricePerNight: String(c.pricePerNight),
      rooms: c.rooms,
    }));
  }

  // Rooms
  async createRoom(
    businessId: string,
    branchId: string,
    data: { categoryId: string; roomNumber: string; roomName?: string },
    createdBy: string,
  ) {
    try {
      const room = await this.prisma.room.create({
        data: {
          businessId,
          branchId,
          categoryId: data.categoryId,
          roomNumber: data.roomNumber,
          roomName: data.roomName,
          status: 'VACANT',
          createdBy,
        },
      });
      return room;
    } catch (e: any) {
      // Prisma unique constraint error
      if (e?.code === 'P2002') {
        throw new ConflictException('Room already exists. Please use a different room number.');
      }
      throw e;
    }
  }

  async getRooms(businessId: string, branchId?: string) {
    const where: { businessId: string; branchId?: string } = { businessId };
    if (branchId) where.branchId = branchId;
    const rooms = await this.prisma.room.findMany({
      where,
      include: { category: true },
      orderBy: { roomNumber: 'asc' },
    });
    return rooms.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      roomName: r.roomName,
      status: r.status,
      category: {
        id: r.category.id,
        name: r.category.name,
        pricePerNight: String(r.category.pricePerNight),
      },
    }));
  }

  async updateRoom(
    businessId: string,
    roomId: string,
    data: { roomNumber?: string; roomName?: string; categoryId?: string },
  ) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, businessId },
    });
    if (!room) throw new NotFoundException('Room not found');
    const updateData: Record<string, unknown> = {};
    if (data.roomNumber !== undefined) updateData.roomNumber = data.roomNumber;
    if (data.roomName !== undefined) updateData.roomName = data.roomName;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    try {
      return await this.prisma.room.update({
        where: { id: roomId },
        data: updateData,
        include: { category: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Room number already exists. Please use a different room number.');
      }
      throw e;
    }
  }

  async deleteRoom(businessId: string, roomId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, businessId },
      include: { bookings: { where: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'RESERVED'] } } } },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.bookings.length > 0) {
      throw new NotFoundException('Cannot delete room with active or upcoming bookings');
    }
    await this.prisma.room.delete({ where: { id: roomId } });
    return { success: true };
  }

  async updateRoomStatus(
    businessId: string,
    roomId: string,
    status: string,
    userId?: string,
    role?: string,
  ) {
    const valid = ['VACANT', 'OCCUPIED', 'RESERVED', 'UNDER_MAINTENANCE'];
    if (!valid.includes(status)) throw new NotFoundException('Invalid status');
    // Only manager-level can set UNDER_MAINTENANCE
    if (status === 'UNDER_MAINTENANCE' && !isManagerLevel(role)) {
      throw new NotFoundException('Only manager can set room to maintenance');
    }
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
      totalAmount?: number;
      currency?: string;
      paymentMode?: string;
      checkInImmediately?: boolean;
      paidAmount?: number;
    },
    createdBy: string,
    createdByRole?: string,
    createdByWorker?: { workerId: string; workerName: string },
  ) {
    const room = await this.prisma.room.findFirst({
      where: { id: data.roomId, businessId },
      include: { category: true },
    });
    if (!room) throw new NotFoundException('Room not found');

    const canOverrideTotal = isManagerLevel(createdByRole);
    const totalAmount =
      canOverrideTotal && data.totalAmount != null && data.totalAmount >= 0
        ? data.totalAmount
        : Number(room.category.pricePerNight) * data.nights;
    const folioNumber = `FOL-${Date.now()}`;

    // When checkInImmediately: create as active folio (CHECKED_IN) and room OCCUPIED
    const status = data.checkInImmediately ? 'CHECKED_IN' : 'CONFIRMED';
    const roomStatus = data.checkInImmediately ? 'OCCUPIED' : 'RESERVED';

    const initialPaid = data.paidAmount != null ? Number(data.paidAmount) : 0;
    if (initialPaid < 0) throw new NotFoundException('Invalid paid amount');
    if (initialPaid > 0 && !PAYMENT_MODES.includes((data.paymentMode || '') as any)) {
      throw new NotFoundException('Invalid payment mode');
    }
    if (initialPaid > totalAmount) {
      throw new NotFoundException('Paid amount cannot exceed total amount');
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.create({
        data: {
          businessId,
          branchId,
          roomId: data.roomId,
          guestName: data.guestName,
          guestPhone: data.guestPhone,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          nights: data.nights,
          roomAmount: new Decimal(totalAmount),
          totalAmount: new Decimal(totalAmount),
          currency: data.currency || 'TZS',
          paymentMode: data.paymentMode,
          status,
          folioNumber,
          createdBy,
          createdByWorkerId: createdByWorker?.workerId ?? null,
          createdByWorkerName: createdByWorker?.workerName ?? null,
        },
        include: { room: { include: { category: true } } },
      });

      await tx.room.update({
        where: { id: data.roomId },
        data: { status: roomStatus },
      });

      if (initialPaid > 0) {
        await tx.folioPayment.create({
          data: {
            bookingId: b.id,
            amount: new Decimal(initialPaid),
            paymentMode: data.paymentMode!,
            createdBy,
            createdByRole: createdByRole || null,
            createdByWorkerId: createdByWorker?.workerId ?? null,
            createdByWorkerName: createdByWorker?.workerName ?? null,
          },
        });
      }
      return b;
    });

    // Optional QuickBooks sync (never blocks / never throws)
    void this.accounting.syncBookingCreated(businessId, booking.id).catch(() => {});

    // Customer pays at booking: if no amount entered, treat as full payment (Paid)
    const total = Number(totalAmount);
    const paid = initialPaid > 0 ? initialPaid : total;
    const balance = Math.max(0, total - paid);
    const paymentStatus =
      balance <= 0 ? 'FULLY_PAID' : 'PARTIALLY_PAID';

    return {
      ...booking,
      paidAmount: paid.toFixed(2),
      balance: balance.toFixed(2),
      paymentStatus: paymentStatus as 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID',
    };
  }

  async addPayment(
    bookingId: string,
    businessId: string,
    data: { amount: number; paymentMode: string },
    createdBy: string,
    createdByRole?: string,
    createdByWorker?: { workerId: string; workerName: string },
  ) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      include: { payments: true },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status === 'CANCELLED' || b.status === 'CHECKED_OUT') {
      throw new NotFoundException('Cannot add payments to this booking status');
    }
    if (!PAYMENT_MODES.includes(data.paymentMode as any)) {
      throw new NotFoundException('Invalid payment mode');
    }
    const summary = this.computePaymentSummary(b.totalAmount, b.payments);
    if (data.amount > summary.balance + 0.0001) {
      throw new NotFoundException('Payment exceeds remaining balance');
    }
    const payment = await this.prisma.folioPayment.create({
      data: {
        bookingId,
        amount: new Decimal(data.amount),
        paymentMode: data.paymentMode,
        createdBy,
        createdByRole: createdByRole || null,
        createdByWorkerId: createdByWorker?.workerId ?? null,
        createdByWorkerName: createdByWorker?.workerName ?? null,
      },
    });

    // Optional QuickBooks sync (never blocks / never throws)
    void this.accounting.syncFolioPayment(businessId, payment.id).catch(() => {});

    return { message: 'Payment added' };
  }

  async getPayments(bookingId: string, businessId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
    });
    if (!b) throw new NotFoundException('Booking not found');
    return this.prisma.folioPayment.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBookings(
    businessId: string,
    branchId: string | null,
    opts?: { scope?: 'all' | 'today' | 'mine'; userId?: string },
    dateRange?: { from: string; to: string },
  ) {
    const bid = branchId || 'main';
    const where: Record<string, unknown> = { businessId, branchId: bid };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const orConditions: Record<string, unknown>[] = [];
    if (dateRange?.from && dateRange?.to) {
      // Use UTC day boundaries so "today" filter does not include yesterday
      const from = new Date(dateRange.from + 'T00:00:00.000Z');
      const to = new Date(dateRange.to + 'T23:59:59.999Z');
      orConditions.push(
        { checkIn: { gte: from, lte: to } },
        { checkOut: { gte: from, lte: to } },
        { checkIn: { lte: from }, checkOut: { gte: to } },
      );
      // When filtering by date range, do not add extra CHECKED_IN so history shows only range
    } else if (opts?.scope === 'today') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      orConditions.push(
        { checkIn: { gte: today, lt: tomorrow } },
        { checkOut: { gte: today, lt: tomorrow } },
        { status: 'CHECKED_IN', checkIn: { lte: today }, checkOut: { gte: today } },
      );
      orConditions.push({ status: 'CHECKED_IN', checkOut: { gte: today } });
    } else {
      // No date range: include currently in-house (CHECKED_IN) guests
      orConditions.push({ status: 'CHECKED_IN', checkOut: { gte: today } });
    }
    if (orConditions.length > 0) {
      where.OR = orConditions;
    }
    if (opts?.scope === 'mine' && opts?.userId) {
      where.createdBy = opts.userId;
    }
    const bookings = await this.prisma.booking.findMany({
      where,
      include: { room: { include: { category: true } }, payments: true },
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
    return bookings.map((b) => {
      const total = Number(b.totalAmount);
      const paymentsList = b.payments || [];
      const paymentsSum = paymentsList.reduce((s, p) => s + Number(p.amount || 0), 0);
      // New booking with no payment records = customer pays at booking (Paid)
      const summary =
        paymentsList.length === 0
          ? { paidAmount: 0, balance: total, paymentStatus: 'UNPAID' as const }
          : this.computePaymentSummary(b.totalAmount, paymentsList);
      return {
        ...b,
        servedBy: b.createdByWorkerName ?? (b.createdBy ? userMap.get(b.createdBy) ?? b.createdBy : null),
        paidAmount: summary.paidAmount.toFixed(2),
        balance: summary.balance.toFixed(2),
        paymentStatus: summary.paymentStatus,
      };
    });
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
      include: { room: { include: { category: true } }, payments: true },
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
    const roomAmount = Number(b.room.category.pricePerNight) * nights;

    const chargesAgg = await this.prisma.otherRevenue.aggregate({
      where: { companyId: businessId, bookingId },
      _sum: { amount: true },
    });
    const chargesSum = Number(chargesAgg._sum.amount || 0);
    const totalAmount = roomAmount + chargesSum;
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        checkOut: newCheckOut,
        nights,
        roomAmount: new Decimal(roomAmount),
        totalAmount: new Decimal(totalAmount),
      },
    });
    const updated = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      include: { room: { include: { category: true } }, payments: true },
    });
    if (!updated) return { message: 'Stay extended' };
    const summary = updated.payments?.length
      ? this.computePaymentSummary(updated.totalAmount, updated.payments)
      : { paidAmount: 0, balance: Number(updated.totalAmount), paymentStatus: 'UNPAID' as const };
    return {
      message: 'Stay extended',
      booking: {
        id: updated.id,
        checkOut: updated.checkOut,
        nights: updated.nights,
        totalAmount: Number(updated.totalAmount).toFixed(2),
        paidAmount: summary.paidAmount.toFixed(2),
        balance: summary.balance.toFixed(2),
        paymentStatus: summary.paymentStatus,
      },
    };
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
        data: { status: 'UNDER_MAINTENANCE' },
      });
    }
    return { message: 'Status updated' };
  }

  async checkOut(bookingId: string, businessId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, businessId },
    });
    if (!b) throw new NotFoundException('Booking not found');

    const actualCheckOut = new Date(); // Auto-detect checkout date (now)
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_OUT', checkOut: actualCheckOut },
    });
    await this.prisma.room.update({
      where: { id: b.roomId },
      data: { status: 'UNDER_MAINTENANCE' },
    });
    return { message: 'Checked out' };
  }

  async getRoomSummary(businessId: string, _branchId?: string) {
    // Count ALL rooms for the business (dashboard overview is business-wide)
    const rooms = await this.prisma.room.findMany({
      where: { businessId },
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

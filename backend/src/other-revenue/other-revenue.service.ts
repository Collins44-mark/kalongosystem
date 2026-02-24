import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingService } from '../accounting/accounting.service';

const PAYMENT_METHODS = ['CASH', 'BANK', 'CARD'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

@Injectable()
export class OtherRevenueService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  async listCategories(companyId: string) {
    const rows = await this.prisma.revenueCategory.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, linkedQuickBooksAccountId: true, createdAt: true },
    });
    if (rows.length === 0) {
      const defaults = ['Swimming', 'Laundry', 'Spa', 'Tour', 'Hall Rental'];
      // Best-effort seed; never fail the request
      try {
        await this.prisma.revenueCategory.createMany({
          data: defaults.map((name) => ({ companyId, name })),
          skipDuplicates: true,
        });
      } catch {
        // ignore
      }
      const seeded = await this.prisma.revenueCategory.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, linkedQuickBooksAccountId: true, createdAt: true },
      });
      return seeded;
    }
    return rows;
  }

  async createCategory(companyId: string, name: string, linkedQuickBooksAccountId?: string | null) {
    const nm = String(name ?? '').trim();
    if (!nm) throw new BadRequestException('Category name is required');
    if (nm.length > 80) throw new BadRequestException('Category name is too long');

    const linked = String(linkedQuickBooksAccountId ?? '').trim() || null;
    try {
      return await this.prisma.revenueCategory.create({
        data: {
          companyId,
          name: nm,
          linkedQuickBooksAccountId: linked,
        },
        select: { id: true, name: true, linkedQuickBooksAccountId: true, createdAt: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException('Category already exists');
      }
      throw e;
    }
  }

  async lookupBookings(companyId: string, q?: string) {
    const query = String(q ?? '').trim().toLowerCase();
    const where: any = {
      businessId: companyId,
      status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
    };
    if (query) {
      where.OR = [
        { guestName: { contains: query, mode: 'insensitive' } },
        { folioNumber: { contains: query, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, guestName: true, folioNumber: true, room: { select: { roomNumber: true } } },
    });
    return rows.map((b) => ({
      id: b.id,
      label: `${String(b.guestName ?? '').trim() || 'Guest'} · ${b.folioNumber || b.id} · Room ${b.room?.roomNumber ?? '—'}`,
    }));
  }

  async listOtherRevenue(companyId: string, opts: { bookingId?: string; from?: Date; to?: Date }) {
    const where: any = { companyId };
    if (opts.bookingId) where.bookingId = opts.bookingId;
    if (opts.from || opts.to) {
      where.date = {};
      if (opts.from) where.date.gte = opts.from;
      if (opts.to) where.date.lte = opts.to;
    }
    const rows = await this.prisma.otherRevenue.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { category: true },
    });
    return rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId ?? null,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? '',
      description: r.description ?? '',
      amount: Number(r.amount),
      paymentMethod: r.paymentMethod,
      date: r.date.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async addOtherRevenue(companyId: string, data: {
    bookingId?: string | null;
    categoryId: string;
    description?: string;
    amount: number;
    paymentMethod: string;
    date: Date;
    createdBy?: string | null;
  }) {
    const categoryId = String(data.categoryId ?? '').trim();
    if (!categoryId) throw new BadRequestException('Category is required');

    const amount = Number(data.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Amount must be greater than 0');

    const paymentMethodRaw = String(data.paymentMethod ?? '').trim().toUpperCase();
    if (!PAYMENT_METHODS.includes(paymentMethodRaw as PaymentMethod)) {
      throw new BadRequestException('Invalid payment method');
    }

    const date = data.date instanceof Date && Number.isFinite(data.date.getTime()) ? data.date : new Date();
    const bookingId = String(data.bookingId ?? '').trim() || null;

    // Validate category exists
    const cat = await this.prisma.revenueCategory.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    });
    if (!cat) throw new NotFoundException('Revenue category not found');

    const description = String(data.description ?? '').trim() || null;

    const created = await this.prisma.$transaction(async (tx) => {
      if (bookingId) {
        const b = await tx.booking.findFirst({
          where: { id: bookingId, businessId: companyId },
          select: { id: true, totalAmount: true },
        });
        if (!b) throw new NotFoundException('Booking not found');
      }

      const r = await tx.otherRevenue.create({
        data: {
          companyId,
          bookingId,
          categoryId,
          description,
          amount: new Decimal(amount),
          paymentMethod: paymentMethodRaw,
          date,
          createdBy: data.createdBy ?? null,
        },
        select: { id: true, bookingId: true, amount: true },
      });

      if (bookingId) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { totalAmount: { increment: new Decimal(amount) } },
        });
      }

      return r;
    });

    // Optional QuickBooks sync (never blocks / never throws)
    void this.accounting.syncOtherRevenue(companyId, created.id).catch(() => {});

    return { id: created.id };
  }
}


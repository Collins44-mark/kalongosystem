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

  async updateCategory(companyId: string, categoryId: string, data: { name?: string; linkedQuickBooksAccountId?: string | null }) {
    const existing = await this.prisma.revenueCategory.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Revenue category not found');

    const update: any = {};
    if (data.name !== undefined) {
      const nm = String(data.name ?? '').trim();
      if (!nm) throw new BadRequestException('Category name is required');
      if (nm.length > 80) throw new BadRequestException('Category name is too long');
      update.name = nm;
    }
    if (data.linkedQuickBooksAccountId !== undefined) {
      update.linkedQuickBooksAccountId = String(data.linkedQuickBooksAccountId ?? '').trim() || null;
    }

    try {
      return await this.prisma.revenueCategory.update({
        where: { id: categoryId },
        data: update,
        select: { id: true, name: true, linkedQuickBooksAccountId: true, createdAt: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Category already exists');
      throw e;
    }
  }

  async deleteCategory(companyId: string, categoryId: string) {
    const existing = await this.prisma.revenueCategory.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Revenue category not found');

    const used = await this.prisma.otherRevenue.count({ where: { companyId, categoryId } });
    if (used > 0) throw new BadRequestException('Cannot delete a category that already has revenue records');

    await this.prisma.revenueCategory.delete({ where: { id: categoryId } });
    return { success: true };
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
    categoryId?: string;
    categoryName?: string;
    description?: string;
    amount: number;
    paymentMethod: string;
    date: Date;
    createdBy?: string | null;
  }) {
    const categoryIdRaw = String(data.categoryId ?? '').trim();
    const categoryNameRaw = String(data.categoryName ?? '').trim();
    if (!categoryIdRaw && !categoryNameRaw) throw new BadRequestException('Category is required');

    const amount = Number(data.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Amount must be greater than 0');

    const paymentMethodRaw = String(data.paymentMethod ?? '').trim().toUpperCase();
    if (!PAYMENT_METHODS.includes(paymentMethodRaw as PaymentMethod)) {
      throw new BadRequestException('Invalid payment method');
    }

    const date = data.date instanceof Date && Number.isFinite(data.date.getTime()) ? data.date : new Date();
    const bookingId = String(data.bookingId ?? '').trim() || null;

    // Resolve category:
    // - If `categoryId` provided -> validate it belongs to the business
    // - Else -> find/create by `categoryName` (business-specific)
    let categoryId = categoryIdRaw;
    if (categoryId) {
      const cat = await this.prisma.revenueCategory.findFirst({
        where: { id: categoryId, companyId },
        select: { id: true },
      });
      if (!cat) throw new NotFoundException('Revenue category not found');
    } else {
      const nm = categoryNameRaw.replace(/\s+/g, ' ');
      if (!nm) throw new BadRequestException('Category is required');
      if (nm.length > 80) throw new BadRequestException('Category name is too long');

      const existing = await this.prisma.revenueCategory.findFirst({
        where: {
          companyId,
          name: { equals: nm, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (existing?.id) {
        categoryId = existing.id;
      } else {
        try {
          const createdCat = await this.prisma.revenueCategory.create({
            data: { companyId, name: nm },
            select: { id: true },
          });
          categoryId = createdCat.id;
        } catch (e: any) {
          // If another request created it concurrently, read it back.
          const after = await this.prisma.revenueCategory.findFirst({
            where: {
              companyId,
              name: { equals: nm, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (after?.id) categoryId = after.id;
          else throw e;
        }
      }
    }

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


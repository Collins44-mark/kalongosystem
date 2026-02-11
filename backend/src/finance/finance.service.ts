import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private async getVatConfig(businessId: string): Promise<{ enabled: boolean; rate: number; type: 'inclusive' | 'exclusive' }> {
    const settings = await this.prisma.businessSetting.findMany({
      where: { businessId, key: { in: ['vat_enabled', 'vat_rate', 'vat_type'] } },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));
    const enabled = map.get('vat_enabled') === 'true';
    const rate = Math.max(0, Number(map.get('vat_rate') ?? 0) || 0);
    const typeRaw = map.get('vat_type');
    const type = typeRaw === 'exclusive' ? 'exclusive' : 'inclusive';
    return { enabled, rate, type };
  }

  private splitVatFromGross(gross: number, cfg: { enabled: boolean; rate: number; type: 'inclusive' | 'exclusive' }) {
    const g = Math.max(0, gross || 0);
    if (!cfg.enabled || cfg.rate <= 0) return { net: g, vat: 0, gross: g };
    // For cash collected, VAT can be derived from gross for both inclusive and exclusive pricing.
    const net = g / (1 + cfg.rate);
    const vat = g - net;
    return { net, vat, gross: g };
  }

  private round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private async getBarSales(businessId: string, from?: Date, to?: Date) {
    const where: any = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    const r = await this.prisma.barOrder.aggregate({
      where,
      _sum: { totalAmount: true },
    });
    return Number(r._sum.totalAmount || 0);
  }

  private async getRestaurantSales(businessId: string, from?: Date, to?: Date) {
    const where: any = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    const r = await this.prisma.restaurantOrder.aggregate({
      where,
      _sum: { totalAmount: true },
    });
    return Number(r._sum.totalAmount || 0);
  }

  async getHotelRevenue(businessId: string, from?: Date, to?: Date) {
    const where: any = { businessId, status: 'CHECKED_OUT' };
    if (from || to) {
      where.checkOut = {};
      if (from) where.checkOut.gte = from;
      if (to) where.checkOut.lte = to;
    }
    const r = await this.prisma.booking.aggregate({
      where,
      _sum: { totalAmount: true },
    });
    return Number(r._sum.totalAmount || 0);
  }

  async getRevenue(businessId: string, from?: Date, to?: Date) {
    const bar = await this.getBarSales(businessId, from, to);
    const rest = await this.getRestaurantSales(businessId, from, to);
    const hotel = await this.getHotelRevenue(businessId, from, to);
    const total = bar + rest + hotel;
    return { bar, restaurant: rest, hotel, total };
  }

  async getExpenses(businessId: string, branchId: string, from?: Date, to?: Date) {
    const where: any = { businessId, branchId };
    if (from || to) {
      where.expenseDate = {};
      if (from) where.expenseDate.gte = from;
      if (to) where.expenseDate.lte = to;
    }
    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
    });
    const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { expenses, total };
  }

  async createExpense(
    businessId: string,
    branchId: string,
    data: {
      category: string;
      amount: number;
      description?: string;
      expenseDate: Date;
    },
    createdBy: string,
  ) {
    return this.prisma.expense.create({
      data: {
        businessId,
        branchId,
        category: data.category,
        amount: new Decimal(data.amount),
        description: data.description,
        expenseDate: data.expenseDate,
        createdBy,
      },
    });
  }

  async getNetProfit(businessId: string, branchId: string, from?: Date, to?: Date) {
    const rev = await this.getRevenue(businessId, from, to);
    const { total: expTotal } = await this.getExpenses(
      businessId,
      branchId,
      from,
      to,
    );
    return { revenue: rev.total, expenses: expTotal, netProfit: rev.total - expTotal };
  }

  async getDashboard(businessId: string, branchId: string, from?: Date, to?: Date) {
    const revenue = await this.getRevenue(businessId, from, to);
    const { expenses, total: expTotal } = await this.getExpenses(
      businessId,
      branchId,
      from,
      to,
    );
    const netProfit = revenue.total - expTotal;
    return {
      totalRevenue: revenue.total,
      totalExpenses: expTotal,
      netProfit,
      bySector: { bar: revenue.bar, restaurant: revenue.restaurant, hotel: revenue.hotel },
      expenses,
    };
  }

  /** Revenue sales history by sector - for Finance drill-down (MANAGER only) */
  async getRevenueSalesHistory(
    businessId: string,
    sector: 'bar' | 'restaurant' | 'hotel',
    from?: Date,
    to?: Date,
  ) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = from;
    if (to) dateFilter.lte = to;

    if (sector === 'bar') {
      const where: Record<string, unknown> = { businessId };
      if (Object.keys(dateFilter).length) where.createdAt = dateFilter;
      const orders = await this.prisma.barOrder.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...new Set(orders.map((o) => o.createdById))] } },
        select: { id: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u.email]));
      return orders.map((o) => ({
        id: o.id,
        date: o.createdAt,
        orderId: o.orderNumber,
        amount: Number(o.totalAmount),
        paymentMode: o.paymentMethod,
        staff: userMap.get(o.createdById) ?? o.createdById,
      }));
    }

    if (sector === 'restaurant') {
      const where: Record<string, unknown> = { businessId };
      if (Object.keys(dateFilter).length) where.createdAt = dateFilter;
      const orders = await this.prisma.restaurantOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...new Set(orders.map((o) => o.createdById))] } },
        select: { id: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u.email]));
      return orders.map((o) => ({
        id: o.id,
        date: o.createdAt,
        orderId: o.orderNumber,
        amount: Number(o.totalAmount),
        paymentMode: o.paymentMethod,
        staff: userMap.get(o.createdById) ?? o.createdById,
      }));
    }

    // hotel
    const where: Record<string, unknown> = { businessId, status: 'CHECKED_OUT' };
    if (Object.keys(dateFilter).length) where.checkOut = dateFilter;
    const bookings = await this.prisma.booking.findMany({
      where,
      include: { room: { include: { category: true } } },
      orderBy: { checkOut: 'desc' },
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
      id: b.id,
      date: b.checkOut,
      orderId: b.folioNumber ?? b.id,
      amount: Number(b.totalAmount),
      paymentMode: '—',
      staff: (b.createdBy && userMap.get(b.createdBy)) ?? b.createdBy ?? '—',
    }));
  }

  /** Expenses by category - for Finance drill-down (MANAGER only) */
  async getExpensesByCategory(
    businessId: string,
    branchId: string,
    from?: Date,
    to?: Date,
  ) {
    const where: Record<string, unknown> = { businessId, branchId };
    if (from || to) {
      where.expenseDate = {};
      if (from) (where.expenseDate as Record<string, Date>).gte = from;
      if (to) (where.expenseDate as Record<string, Date>).lte = to;
    }
    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
    });
    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
    }
    return {
      byCategory,
      expenses: expenses.map((e) => ({
        id: e.id,
        category: e.category,
        amount: Number(e.amount),
        date: e.expenseDate,
        notes: e.description ?? null,
      })),
    };
  }

  async getOverview(businessId: string, from: Date, to: Date) {
    const vat = await this.getVatConfig(businessId);

    const [roomsAgg, barAgg, restAgg] = await Promise.all([
      this.prisma.folioPayment.aggregate({
        where: { booking: { businessId }, createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.barOrder.aggregate({
        where: { businessId, createdAt: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      }),
      this.prisma.restaurantOrder.aggregate({
        where: { businessId, createdAt: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      }),
    ]);

    const roomsGross = Number(roomsAgg._sum.amount || 0);
    const barGross = Number(barAgg._sum.totalAmount || 0);
    const restaurantGross = Number(restAgg._sum.totalAmount || 0);

    const roomsSplit = this.splitVatFromGross(roomsGross, vat);
    const barSplit = this.splitVatFromGross(barGross, vat);
    const restaurantSplit = this.splitVatFromGross(restaurantGross, vat);

    const grossSales = roomsGross + barGross + restaurantGross;
    const netRevenue = roomsSplit.net + barSplit.net + restaurantSplit.net;
    const vatCollected = roomsSplit.vat + barSplit.vat + restaurantSplit.vat;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      vat: { vat_enabled: vat.enabled, vat_rate: vat.rate, vat_type: vat.type },
      totals: {
        netRevenue: this.round2(netRevenue),
        grossSales: this.round2(grossSales),
        vatCollected: this.round2(vatCollected),
      },
      bySector: {
        rooms: { net: this.round2(roomsSplit.net), vat: this.round2(roomsSplit.vat), gross: this.round2(roomsSplit.gross) },
        bar: { net: this.round2(barSplit.net), vat: this.round2(barSplit.vat), gross: this.round2(barSplit.gross) },
        restaurant: { net: this.round2(restaurantSplit.net), vat: this.round2(restaurantSplit.vat), gross: this.round2(restaurantSplit.gross) },
      },
    };
  }

  async getTransactions(
    businessId: string,
    from: Date,
    to: Date,
    sector: 'all' | 'rooms' | 'bar' | 'restaurant',
    page: number,
    pageSize: number,
  ) {
    const vat = await this.getVatConfig(businessId);

    type Txn = {
      date: Date;
      referenceId: string;
      sector: 'rooms' | 'bar' | 'restaurant';
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
      paymentMode: string;
    };

    const txns: Txn[] = [];

    if (sector === 'all' || sector === 'rooms') {
      const payments = await this.prisma.folioPayment.findMany({
        where: { booking: { businessId }, createdAt: { gte: from, lte: to } },
        include: { booking: { select: { id: true, folioNumber: true } } },
        orderBy: { createdAt: 'desc' },
      });
      for (const p of payments) {
        const gross = Number(p.amount);
        const split = this.splitVatFromGross(gross, vat);
        txns.push({
          date: p.createdAt,
          referenceId: p.bookingId,
          sector: 'rooms',
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.vat),
          grossAmount: this.round2(split.gross),
          paymentMode: p.paymentMode,
        });
      }
    }

    if (sector === 'all' || sector === 'bar') {
      const orders = await this.prisma.barOrder.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, orderNumber: true, totalAmount: true, paymentMethod: true, createdAt: true },
      });
      for (const o of orders) {
        const gross = Number(o.totalAmount);
        const split = this.splitVatFromGross(gross, vat);
        txns.push({
          date: o.createdAt,
          referenceId: o.orderNumber || o.id,
          sector: 'bar',
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.vat),
          grossAmount: this.round2(split.gross),
          paymentMode: o.paymentMethod,
        });
      }
    }

    if (sector === 'all' || sector === 'restaurant') {
      const orders = await this.prisma.restaurantOrder.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, orderNumber: true, totalAmount: true, paymentMethod: true, createdAt: true },
      });
      for (const o of orders) {
        const gross = Number(o.totalAmount);
        const split = this.splitVatFromGross(gross, vat);
        txns.push({
          date: o.createdAt,
          referenceId: o.orderNumber || o.id,
          sector: 'restaurant',
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.vat),
          grossAmount: this.round2(split.gross),
          paymentMode: o.paymentMethod,
        });
      }
    }

    txns.sort((a, b) => b.date.getTime() - a.date.getTime());
    const total = txns.length;
    const start = (page - 1) * pageSize;
    const rows = txns.slice(start, start + pageSize).map((r) => ({
      ...r,
      date: r.date.toISOString(),
    }));

    return { page, pageSize, total, rows };
  }
}

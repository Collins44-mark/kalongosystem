import { Injectable } from '@nestjs/common';
import { applyHmsPageFooter, drawHmsReportHeader } from '../common/pdf-utils';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingService } from '../accounting/accounting.service';
import { readFile } from 'fs/promises';
import { join as joinPath } from 'path';

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  private async getTaxConfig(
    businessId: string,
  ): Promise<{
    enabled: boolean;
    rateBySector: { rooms: number; bar: number; restaurant: number };
  }> {
    const settings = await this.prisma.businessSetting.findMany({
      where: {
        businessId,
        key: {
          in: [
            'taxes',
            'vat_enabled',
            'vat_rate',
            'vat_apply_rooms',
            'vat_apply_bar',
            'vat_apply_restaurant',
          ],
        },
      },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));

    // Preferred: `taxes` JSON array from settings
    const taxesRaw = map.get('taxes');
    let taxes: Array<any> = [];
    try {
      taxes = Array.isArray(taxesRaw) ? (taxesRaw as any[]) : taxesRaw ? JSON.parse(String(taxesRaw)) : [];
    } catch {
      taxes = [];
    }
    const enabledTaxes = (Array.isArray(taxes) ? taxes : []).filter((t) => t && t.enabled === true);

    if (enabledTaxes.length > 0) {
      const rateSum = (sector: 'rooms' | 'bar' | 'restaurant') =>
        enabledTaxes.reduce((s, t) => {
          const rate = Math.max(0, Number(t.rate ?? 0) || 0);
          const apply = t.apply ?? {};
          const applies = sector === 'rooms' ? apply.rooms !== false : sector === 'bar' ? apply.bar !== false : apply.restaurant !== false;
          return applies ? s + rate : s;
        }, 0);

      return {
        enabled: true,
        rateBySector: {
          rooms: rateSum('rooms'),
          bar: rateSum('bar'),
          restaurant: rateSum('restaurant'),
        },
      };
    }

    // Fallback: legacy single VAT keys
    const enabledRaw = map.get('vat_enabled');
    const enabled = enabledRaw === 'true' || enabledRaw === '1';
    const rateRaw = map.get('vat_rate');
    const rate = Math.max(0, Number(rateRaw ?? 0) || 0);
    const applyRoomsRaw = map.get('vat_apply_rooms');
    const applyBarRaw = map.get('vat_apply_bar');
    const applyRestaurantRaw = map.get('vat_apply_restaurant');
    return {
      enabled: enabled && rate > 0,
      rateBySector: {
        rooms: applyRoomsRaw === 'false' ? 0 : rate,
        bar: applyBarRaw === 'false' ? 0 : rate,
        restaurant: applyRestaurantRaw === 'false' ? 0 : rate,
      },
    };
  }

  private splitTaxFromGross(gross: number, enabled: boolean, rate: number) {
    const g = Math.max(0, gross || 0);
    if (!enabled || rate <= 0) return { net: g, tax: 0, gross: g };
    const net = g / (1 + rate);
    const tax = g - net;
    return { net, tax, gross: g };
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
    const where: any = { businessId, status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
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
    const exp = await this.prisma.expense.create({
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

    // Optional QuickBooks sync (never blocks / never throws)
    void this.accounting.syncExpense(businessId, exp.id).catch(() => {});

    return exp;
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

  /** Sales overview and expenses use the same date range; net profit = net revenue − expenses. */
  async getDashboard(businessId: string, branchId: string, from?: Date, to?: Date) {
    const now = new Date();
    const rangeFrom = from || new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeTo = to || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [overview, { expenses, total: expTotal }] = await Promise.all([
      this.getOverview(businessId, rangeFrom, rangeTo),
      this.getExpenses(businessId, branchId, rangeFrom, rangeTo),
    ]);

    const netProfit = overview.totals.netRevenue - expTotal;
    return {
      totalRevenue: overview.totals.grossSales,
      totalExpenses: expTotal,
      netProfit,
      bySector: {
        bar: overview.bySector.bar.gross,
        restaurant: overview.bySector.restaurant.gross,
        hotel: overview.bySector.rooms.gross,
      },
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

    // hotel: revenue by booking date (paid at booking)
    const where: Record<string, unknown> = { businessId, status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } };
    if (Object.keys(dateFilter).length) where.createdAt = dateFilter;
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
      id: b.id,
      date: b.createdAt,
      orderId: b.folioNumber ?? b.id,
      amount: Number(b.totalAmount),
      paymentMode: b.paymentMode ? `${b.paymentMode} (Paid direct)` : 'Paid direct',
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
    const tax = await this.getTaxConfig(businessId);

    // Room revenue = when booking is made (paid at booking). Filter by booking date so daily view matches.
    const [roomsAgg, barAgg, restAgg, otherAgg] = await Promise.all([
      this.prisma.booking.aggregate({
        where: {
          businessId,
          status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
          createdAt: { gte: from, lte: to },
        },
        _sum: { roomAmount: true },
      }),
      this.prisma.barOrder.aggregate({
        where: { businessId, createdAt: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      }),
      this.prisma.restaurantOrder.aggregate({
        where: { businessId, createdAt: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      }),
      this.prisma.otherRevenue.aggregate({
        where: { companyId: businessId, date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
    ]);

    const roomsGross = Number(roomsAgg._sum.roomAmount || 0);
    const barGross = Number(barAgg._sum.totalAmount || 0);
    const restaurantGross = Number(restAgg._sum.totalAmount || 0);
    const otherGross = Number(otherAgg._sum.amount || 0);

    const roomsSplit = this.splitTaxFromGross(roomsGross, tax.enabled, tax.rateBySector.rooms);
    const barSplit = this.splitTaxFromGross(barGross, tax.enabled, tax.rateBySector.bar);
    const restaurantSplit = this.splitTaxFromGross(restaurantGross, tax.enabled, tax.rateBySector.restaurant);
    const otherSplit = this.splitTaxFromGross(otherGross, tax.enabled, tax.rateBySector.rooms);

    const grossSales = roomsGross + barGross + restaurantGross + otherGross;
    const netRevenue = roomsSplit.net + barSplit.net + restaurantSplit.net + otherSplit.net;
    const vatCollected = roomsSplit.tax + barSplit.tax + restaurantSplit.tax + otherSplit.tax;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      // keep legacy shape for frontend
      vat: { vat_enabled: tax.enabled, vat_rate: Math.max(tax.rateBySector.rooms, tax.rateBySector.bar, tax.rateBySector.restaurant), vat_type: 'inclusive' as const },
      totals: {
        netRevenue: this.round2(netRevenue),
        grossSales: this.round2(grossSales),
        vatCollected: this.round2(vatCollected),
      },
      bySector: {
        rooms: { net: this.round2(roomsSplit.net), vat: this.round2(roomsSplit.tax), gross: this.round2(roomsSplit.gross) },
        bar: { net: this.round2(barSplit.net), vat: this.round2(barSplit.tax), gross: this.round2(barSplit.gross) },
        restaurant: { net: this.round2(restaurantSplit.net), vat: this.round2(restaurantSplit.tax), gross: this.round2(restaurantSplit.gross) },
        other: { net: this.round2(otherSplit.net), vat: this.round2(otherSplit.tax), gross: this.round2(otherSplit.gross) },
      },
    };
  }

  async getTransactions(
    businessId: string,
    from: Date,
    to: Date,
    sector: 'all' | 'rooms' | 'bar' | 'restaurant' | 'other',
    page: number,
    pageSize: number,
  ) {
    const txns = await this.collectTransactions(businessId, from, to, sector);
    const total = txns.length;
    const start = (page - 1) * pageSize;
    const rows = txns.slice(start, start + pageSize).map((r) => ({
      ...r,
      date: r.date.toISOString(),
      createdAt: (r.createdAt ?? r.date).toISOString(),
    }));

    return { page, pageSize, total, rows };
  }

  async collectTransactions(
    businessId: string,
    from: Date,
    to: Date,
    sector: 'all' | 'rooms' | 'bar' | 'restaurant' | 'other',
  ) {
    const tax = await this.getTaxConfig(businessId);

    type Txn = {
      date: Date;
      referenceId: string;
      sector: 'rooms' | 'bar' | 'restaurant' | 'other';
      customerName: string;
      category?: string;
      description?: string;
      createdAt?: Date;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
      paymentMode: string;
    };

    const txns: Txn[] = [];

    if (sector === 'all' || sector === 'rooms') {
      const bookings = await this.prisma.booking.findMany({
        where: {
          businessId,
          status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
          createdAt: { gte: from, lte: to },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, folioNumber: true, guestName: true, totalAmount: true, createdAt: true, paymentMode: true },
      });
      for (const b of bookings) {
        const gross = Number(b.totalAmount);
        const split = this.splitTaxFromGross(gross, tax.enabled, tax.rateBySector.rooms);
        const mode = b.paymentMode ? `${b.paymentMode} (Paid direct)` : 'Paid direct';
        txns.push({
          date: b.createdAt,
          createdAt: b.createdAt,
          referenceId: b.folioNumber || b.id,
          sector: 'rooms',
          customerName: String(b.guestName || '').trim(),
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.tax),
          grossAmount: this.round2(split.gross),
          paymentMode: mode,
        });
      }
    }

    if (sector === 'all' || sector === 'bar') {
      const orders = await this.prisma.barOrder.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, orderNumber: true, totalAmount: true, paymentMethod: true, customerName: true, createdAt: true },
      });
      for (const o of orders) {
        const gross = Number(o.totalAmount);
        const split = this.splitTaxFromGross(gross, tax.enabled, tax.rateBySector.bar);
        txns.push({
          date: o.createdAt,
          createdAt: o.createdAt,
          referenceId: o.orderNumber || o.id,
          sector: 'bar',
          customerName: String(o.customerName || '').trim(),
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.tax),
          grossAmount: this.round2(split.gross),
          paymentMode: o.paymentMethod,
        });
      }
    }

    if (sector === 'all' || sector === 'other') {
      const revenues = await this.prisma.otherRevenue.findMany({
        where: { companyId: businessId, date: { gte: from, lte: to } },
        orderBy: { date: 'desc' },
        select: {
          id: true,
          bookingId: true,
          amount: true,
          paymentMethod: true,
          description: true,
          date: true,
          createdAt: true,
          category: { select: { name: true } },
          booking: { select: { folioNumber: true, guestName: true } },
        },
      });
      for (const r of revenues) {
        const gross = Number(r.amount);
        const split = this.splitTaxFromGross(gross, tax.enabled, tax.rateBySector.rooms);
        const ref = r.booking?.folioNumber || `OR-${String(r.id).slice(-8)}`;
        const cust = String(r.booking?.guestName ?? '').trim();
        const label = String(r.category?.name ?? '').trim();
        const desc = String(r.description ?? '').trim();
        txns.push({
          date: r.date,
          createdAt: r.createdAt ?? r.date,
          referenceId: ref,
          sector: 'other',
          customerName: cust || label || 'Other Revenue',
          category: label || undefined,
          description: desc || undefined,
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.tax),
          grossAmount: this.round2(split.gross),
          paymentMode: String(r.paymentMethod ?? '').trim() || 'CASH',
        });
      }
    }

    if (sector === 'all' || sector === 'restaurant') {
      const orders = await this.prisma.restaurantOrder.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, orderNumber: true, totalAmount: true, paymentMethod: true, customerName: true, createdAt: true },
      });
      for (const o of orders) {
        const gross = Number(o.totalAmount);
        const split = this.splitTaxFromGross(gross, tax.enabled, tax.rateBySector.restaurant);
        txns.push({
          date: o.createdAt,
          createdAt: o.createdAt,
          referenceId: o.orderNumber || o.id,
          sector: 'restaurant',
          customerName: String(o.customerName || '').trim(),
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.tax),
          grossAmount: this.round2(split.gross),
          paymentMode: o.paymentMethod,
        });
      }
    }

    txns.sort((a, b) => b.date.getTime() - a.date.getTime());
    return txns;
  }

  async exportTransactions(
    businessId: string,
    from: Date,
    to: Date,
    sector: 'all' | 'rooms' | 'bar' | 'restaurant' | 'other',
    format: 'csv' | 'xlsx' | 'pdf',
    generatedByRole: string = 'USER',
    branchId: string = 'main',
  ): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const txns = await this.collectTransactions(businessId, from, to, sector);
    const safe = (d: Date) => d.toISOString().slice(0, 10);
    const baseName = `finance-${sector}-${safe(from)}-${safe(to)}`;

    if (format === 'csv') {
      // QuickBooks-ready double-entry style
      const header = 'Date,Account,Debit,Credit,Description';
      const lines: string[] = [header];
      type DayAgg = {
        debitByAccount: Record<string, number>;
        vatTotal: number;
        netByRevenueAccount: Record<string, number>;
      };
      const byDay = new Map<string, DayAgg>();

      for (const t of txns) {
        const day = formatDdMmYyyy(t.date);
        const cashAccount = mapPaymentAccount(t.paymentMode);
        const revenueAccount =
          t.sector === 'rooms'
            ? 'Room Revenue'
            : t.sector === 'bar'
              ? 'Bar Revenue'
              : t.sector === 'restaurant'
                ? 'Restaurant Revenue'
                : 'Other Revenue';

        const agg: DayAgg = byDay.get(day) ?? { debitByAccount: {}, vatTotal: 0, netByRevenueAccount: {} };
        agg.debitByAccount[cashAccount] = (agg.debitByAccount[cashAccount] ?? 0) + Number(t.grossAmount || 0);
        agg.netByRevenueAccount[revenueAccount] =
          (agg.netByRevenueAccount[revenueAccount] ?? 0) + Number(t.netAmount || 0);
        agg.vatTotal += Number(t.vatAmount || 0);
        byDay.set(day, agg);
      }

      const days = [...byDay.keys()].sort((a, b) => {
        // dd/mm/yyyy string → sortable date
        const toDate = (s: string) => {
          const [dd, mm, yyyy] = s.split('/').map((x) => parseInt(x, 10));
          return new Date(yyyy, (mm || 1) - 1, dd || 1).getTime();
        };
        return toDate(a) - toDate(b);
      });

      for (const day of days) {
        const agg = byDay.get(day)!;

        // Debit lines (cash/bank/mobile) for totals received
        for (const [account, debit] of Object.entries(agg.debitByAccount)) {
          const d = round2(debit);
          if (d === 0) continue;
          const desc =
            account === 'Cash'
              ? 'Total cash received'
              : account === 'Bank'
                ? 'Total bank received'
                : 'Total mobile money received';
          lines.push([day, account, d, 0, desc].map(csvEscape).join(','));
        }

        // Credit VAT payable (total)
        const vatTotal = round2(agg.vatTotal);
        if (vatTotal !== 0) {
          lines.push([day, 'VAT Payable', 0, vatTotal, 'VAT collected'].map(csvEscape).join(','));
        }

        // Credit revenue accounts (net)
        for (const [account, credit] of Object.entries(agg.netByRevenueAccount)) {
          const c = round2(credit);
          if (c === 0) continue;
          const desc =
            account === 'Room Revenue'
              ? 'Room revenue'
              : account === 'Bar Revenue'
                ? 'Bar revenue'
                : 'Restaurant revenue';
          lines.push([day, account, 0, c, desc].map(csvEscape).join(','));
        }
      }
      const csv = lines.join('\n') + '\n';
      return {
        filename: `${baseName}-quickbooks.csv`,
        contentType: 'text/csv; charset=utf-8',
        body: Buffer.from(csv, 'utf8'),
      };
    }

    if (format === 'xlsx') {
      // Use runtime require to avoid CommonJS/ESM default-import issues in production builds
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Transactions');
      ws.columns = [
        { header: 'Date', key: 'date', width: 22 },
        { header: 'Reference ID', key: 'referenceId', width: 18 },
        { header: 'Sector', key: 'sector', width: 14 },
        { header: 'Net Amount', key: 'netAmount', width: 14 },
        { header: 'VAT Amount', key: 'vatAmount', width: 14 },
        { header: 'Gross Amount', key: 'grossAmount', width: 14 },
        { header: 'Payment Mode', key: 'paymentMode', width: 16 },
      ];
      txns.forEach((t) =>
        ws.addRow({
          date: t.date.toISOString(),
          referenceId: t.referenceId,
          sector: t.sector,
          netAmount: round2(t.netAmount),
          vatAmount: round2(t.vatAmount),
          grossAmount: round2(t.grossAmount),
          paymentMode: t.paymentMode,
        }),
      );
      const buf: any = await wb.xlsx.writeBuffer();
      return {
        filename: `${baseName}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
      };
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, businessId: true, businessType: true, logoUrl: true },
    });
    const logoBuffer = await this.getBusinessLogoBuffer(business?.logoUrl ?? null);

    const totalNet = txns.reduce((s, t) => s + Number(t.netAmount || 0), 0);
    const totalVat = txns.reduce((s, t) => s + Number(t.vatAmount || 0), 0);
    const totalGross = txns.reduce((s, t) => s + Number(t.grossAmount || 0), 0);

    const expAgg = await this.prisma.expense.aggregate({
      where: { businessId, expenseDate: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    const totalExpenses = Number(expAgg._sum.amount || 0);
    const netProfit = totalGross - totalExpenses;

    const expenses = await this.prisma.expense.findMany({
      where: { businessId, expenseDate: { gte: from, lte: to } },
      orderBy: { expenseDate: 'desc' },
      select: { expenseDate: true, category: true, description: true, amount: true },
    });

    const pdf = await renderFinanceTransactionsPdf({
      logoBuffer,
      businessName: business?.name || 'Business',
      businessId: business?.businessId || businessId,
      branchId: String(branchId || 'main'),
      businessType: business?.businessType || '-',
      reportTitle: 'Finance Transactions Report',
      sector,
      dateRange: { from: safe(from), to: safe(to) },
      generatedAt: new Date(),
      generatedByRole: String(generatedByRole || 'USER'),
      summary: {
        totalNetSales: round2(totalNet),
        totalVat: round2(totalVat),
        totalGrossSales: round2(totalGross),
        totalExpenses: round2(totalExpenses),
        netProfit: round2(netProfit),
      },
      rows: txns.map((t) => ({
        date: t.date,
        reference: t.referenceId,
        sector: t.sector,
        net: round2(t.netAmount),
        vat: round2(t.vatAmount),
        gross: round2(t.grossAmount),
        paymentMode: t.paymentMode,
      })),
      expenseRows: expenses.map((e) => ({
        date: e.expenseDate,
        category: String(e.category || ''),
        description: e.description ? String(e.description) : '',
        amount: round2(Number(e.amount || 0)),
        paymentMode: '-', // not tracked in schema
      })),
    });
    return { filename: `${baseName}.pdf`, contentType: 'application/pdf', body: pdf };
  }

  private async getBusinessLogoBuffer(logoUrl: string | null): Promise<Buffer | null> {
    const url = String(logoUrl ?? '').trim();
    if (!url) return null;

    // Local uploads (preferred)
    try {
      if (url.startsWith('/uploads/')) {
        const p = joinPath(process.cwd(), url.slice(1));
        const buf = await readFile(p);
        return buf.length ? buf : null;
      }
      if (url.startsWith('uploads/')) {
        const p = joinPath(process.cwd(), url);
        const buf = await readFile(p);
        return buf.length ? buf : null;
      }
    } catch {
      // fall through to URL fetch
    }

    // Remote URL (HTTP/S only)
    if (!/^https?:\/\//i.test(url)) return null;

    // Prefer global fetch if available (Node 18+)
    try {
      const f: any = (globalThis as any).fetch;
      if (typeof f === 'function') {
        const res = await f(url);
        if (!res?.ok) return null;
        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);
        return buf.length ? buf : null;
      }
    } catch {
      // fall through
    }

    // Fallback to http/https (no redirects)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { request } = require(url.toLowerCase().startsWith('https://') ? 'node:https' : 'node:http');
      return await new Promise((resolve) => {
        const req = request(url, (resp: any) => {
          if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers?.location) {
            resolve(null);
            return;
          }
          if (resp.statusCode !== 200) {
            resolve(null);
            return;
          }
          const chunks: any[] = [];
          resp.on('data', (c: any) => chunks.push(c));
          resp.on('end', () => {
            const b = Buffer.concat(chunks);
            resolve(b.length ? b : null);
          });
        });
        req.on('error', () => resolve(null));
        req.end();
      });
    } catch {
      return null;
    }
  }
}

function csvEscape(v: any) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function round2(n: number) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function formatDdMmYyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function mapPaymentAccount(mode: string) {
  const m = String(mode || '').toLowerCase();
  if (m.includes('bank')) return 'Bank';
  if (m.includes('mpesa') || m.includes('m-pesa') || m.includes('tigopesa') || m.includes('airtel')) return 'Mobile Money';
  return 'Cash';
}

function formatTsh(n: number) {
  const v = Number(n || 0);
  const formatted = new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(Math.round(v));
  return `TSh ${formatted}`;
}

function formatNumberTz(n: number) {
  const v = Number(n || 0);
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(Math.round(v));
}

function formatDateTime(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function formatSectorLabel(s: string) {
  const v = String(s || '').toLowerCase();
  if (v === 'bar') return 'Bar';
  if (v === 'restaurant') return 'Restaurant';
  if (v === 'rooms' || v === 'room') return 'Rooms';
  // Fallback: capitalize first letter
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : '';
}

function formatPaymentModeLabel(mode: string) {
  const raw = String(mode || '').trim();
  const u = raw.toUpperCase();
  if (!raw) return '';
  // Preserve any suffix like "(Paid direct)" while normalizing the base label
  const suffixMatch = raw.match(/\s*\(.*\)\s*$/);
  const suffix = suffixMatch ? suffixMatch[0] : '';
  const base = suffix ? raw.slice(0, raw.length - suffix.length).trim() : raw;
  const b = base.toUpperCase();
  if (b === 'CASH') return `Cash${suffix}`;
  if (b === 'BANK') return `Bank${suffix}`;
  if (b === 'MOBILE_MONEY' || b === 'MOBILE MONEY') return `Mobile Money${suffix}`;
  if (b.includes('MPESA') || b.includes('M-PESA') || b.includes('TIGOPESA') || b.includes('AIRTEL')) return `Mobile Money${suffix}`;
  // Remove underscores for any other values
  return `${base.replace(/_/g, ' ')}${suffix}`;
}

function fitFontSize(doc: any, text: string, maxWidth: number, baseSize: number, minSize: number) {
  const t = String(text ?? '');
  let size = baseSize;
  doc.fontSize(size);
  while (size > minSize && doc.widthOfString(t) > maxWidth) {
    size -= 0.5;
    doc.fontSize(size);
  }
  return size;
}

function drawCellText(doc: any, text: string, x: number, y: number, width: number, opts: { align: 'left' | 'right' | 'center'; baseSize: number; minSize: number; font?: string }) {
  const t = String(text ?? '');
  if (opts.font) doc.font(opts.font);
  const size = fitFontSize(doc, t, Math.max(1, width), opts.baseSize, opts.minSize);
  // Vertically center text in a 24px row-ish baseline (caller controls y)
  doc.fontSize(size);
  doc.text(t, x, y, { width, align: opts.align, lineBreak: false });
}

function drawCellTextBox(
  doc: any,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: { align: 'left' | 'right' | 'center'; size: number; font?: string },
) {
  const t = String(text ?? '');
  if (opts.font) doc.font(opts.font);
  doc.fontSize(opts.size);
  doc.text(t, x, y, {
    width: Math.max(1, width),
    height: Math.max(1, height),
    align: opts.align,
    ellipsis: true,
  });
}

async function renderFinanceTransactionsPdf(input: {
  logoBuffer?: Buffer | null;
  businessName: string;
  businessId: string;
  branchId: string;
  businessType: string;
  reportTitle: string;
  sector: 'all' | 'rooms' | 'bar' | 'restaurant' | 'other';
  dateRange: { from: string; to: string };
  generatedAt: Date;
  generatedByRole: string;
  summary: {
    totalNetSales: number;
    totalVat: number;
    totalGrossSales: number;
    totalExpenses: number;
    netProfit: number;
  };
  rows: Array<{ date: Date; reference: string; sector: string; net: number; vat: number; gross: number; paymentMode: string }>;
  expenseRows: Array<{ date: Date; category: string; description: string; amount: number; paymentMode: string }>;
}): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => {
        applyHmsPageFooter(doc);
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      let y = drawHmsReportHeader(doc, {
        title: input.reportTitle || 'Finance Report',
        subtitle: 'Hospitality Management System',
        businessName: input.businessName,
        branchId: input.branchId,
        dateRange: input.dateRange,
        generatedAt: input.generatedAt,
        generatedBy: input.generatedByRole || 'User',
      });

      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 30;
      const ensureSpace = (h: number) => {
        if (y + h > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: 30 });
          y = doc.page.margins.top + 8;
        }
      };

      const drawSectionTitle = (title: string) => {
        ensureSpace(26);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(title, x, y);
        y += 14;
        doc.moveTo(x, y).lineTo(x + pageWidth, y).lineWidth(0.5).strokeColor('#9ca3af').stroke();
        doc.strokeColor('#000');
        y += 12;
      };

      // =========================
      // SALES TRANSACTIONS TABLE
      // =========================
      drawSectionTitle('Sales Transactions');

      // Use the full printable width for balanced margins + even distribution.
      // Make Sector slightly narrower to reduce the Sector→Net visual gap.
      const fixed = { date: 70, mode: 120 };
      const remaining = pageWidth - fixed.date - fixed.mode;
      const colW = {
        date: fixed.date,
        sector: 90,
        net: 80,
        vat: 70,
        gross: remaining - (90 + 80 + 70),
        mode: fixed.mode,
      };
      const tableW = colW.date + colW.sector + colW.net + colW.vat + colW.gross + colW.mode;
      // Table spans full width inside margins; keep it visually centered.
      const tableX = x + (pageWidth - tableW) / 2;
      const padX = 6;
      const headerH = 28;
      const rowH = 24;

      const drawColumnDividers = (topY: number, h: number, color: string) => {
        doc.save();
        doc.strokeColor(color).lineWidth(1);
        let vx = tableX + colW.date;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        vx += colW.sector;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        vx += colW.net;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        vx += colW.vat;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        vx += colW.gross;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        doc.restore();
      };

      const drawHeaderRow = () => {
        doc.save();
        doc.rect(tableX, y, tableW, headerH).fillColor('#f3f4f6').fill();
        doc.restore();
        doc.rect(tableX, y, tableW, headerH).strokeColor('#9ca3af').lineWidth(0.5).stroke();
        drawColumnDividers(y, headerH, '#9ca3af');
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        let cx = tableX;
        doc.text('Date', cx + padX, y + 9, { width: colW.date - padX * 2, align: 'left' });
        cx += colW.date;
        doc.text('Sector', cx + padX, y + 9, { width: colW.sector - padX * 2, align: 'left' });
        cx += colW.sector;
        doc.text('Net (TSh)', cx + padX, y + 9, { width: colW.net - padX * 2, align: 'right' });
        cx += colW.net;
        doc.text('VAT (TSh)', cx + padX, y + 9, { width: colW.vat - padX * 2, align: 'right' });
        cx += colW.vat;
        doc.text('Gross (TSh)', cx + padX, y + 9, { width: colW.gross - padX * 2, align: 'right' });
        cx += colW.gross;
        doc.text('Payment Mode', cx + padX, y + 9, { width: colW.mode - padX * 2, align: 'center' });
        y += headerH;
      };

      drawHeaderRow();
      doc.font('Helvetica').fontSize(10).fillColor('#000');

      const drawRow = (r: any, idx: number) => {
        // Alternating background
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(tableX, y, tableW, rowH).fillColor('#f8fafc').fill();
          doc.restore();
        }
        // Row border + subtle column separators
        doc.rect(tableX, y, tableW, rowH).strokeColor('#9ca3af').lineWidth(0.5).stroke();
        drawColumnDividers(y, rowH, '#9ca3af');
        let cx = tableX;
        const dateTxt = formatDdMmYyyy(r.date);
        drawCellText(doc, dateTxt, cx + padX, y + 7, colW.date - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.date;
        drawCellText(doc, formatSectorLabel(r.sector), cx + padX, y + 7, colW.sector - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.sector;
        drawCellText(doc, formatNumberTz(r.net), cx + padX, y + 7, colW.net - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.net;
        drawCellText(doc, formatNumberTz(r.vat), cx + padX, y + 7, colW.vat - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.vat;
        drawCellText(doc, formatNumberTz(r.gross), cx + padX, y + 7, colW.gross - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.gross;
        const modeLabel = formatPaymentModeLabel(String(r.paymentMode || ''));
        drawCellText(doc, modeLabel, cx + padX, y + 7, colW.mode - padX * 2, { align: 'center', baseSize: 10, minSize: 8, font: 'Helvetica' });
        y += rowH;
      };

      let rowIdx = 0;
      for (const r of input.rows) {
        if (y + rowH > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: 30 });
          y = doc.page.margins.top + 8;
          doc.font('Helvetica').fontSize(10).fillColor('#000');
        }
        drawRow(r, rowIdx++);
      }

      // Sales totals row
      const totalsRowH = 36;
      if (y + totalsRowH > bottomLimit()) {
        doc.addPage({ size: 'A4', margin: 30 });
        y = doc.page.margins.top + 8;
      }
      // Top border above totals row
      doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(0.5).strokeColor('#9ca3af').stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(tableX, y, tableW, totalsRowH).fillColor('#f3f4f6').fill();
      doc.restore();
      doc.rect(tableX, y, tableW, totalsRowH).strokeColor('#9ca3af').lineWidth(0.5).stroke();
      drawColumnDividers(y, totalsRowH, '#9ca3af');

      // Totals: one label on the left, then numeric totals aligned under columns.
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('SALES TOTAL', tableX + padX, y + 11, { width: colW.date + colW.sector - padX * 2, align: 'left' });
      let cx = tableX + colW.date + colW.sector;
      doc.text(formatNumberTz(input.summary.totalNetSales), cx + padX, y + 11, { width: colW.net - padX * 2, align: 'right' });
      cx += colW.net;
      doc.text(formatNumberTz(input.summary.totalVat), cx + padX, y + 11, { width: colW.vat - padX * 2, align: 'right' });
      cx += colW.vat;
      doc.text(formatNumberTz(input.summary.totalGrossSales), cx + padX, y + 11, { width: colW.gross - padX * 2, align: 'right' });
      y += totalsRowH;

      y += 16;

      // =========================
      // EXPENSE TRANSACTIONS TABLE
      // =========================
      drawSectionTitle('Expense Transactions');

      // Fixed % widths to prevent overflow: Date 15%, Category 20%, Description 30%, Amount 20%, Payment Mode 15%
      const expTableX = x;
      const expTableW = pageWidth;
      const wDate = Math.floor(expTableW * 0.15);
      const wCategory = Math.floor(expTableW * 0.20);
      const wDesc = Math.floor(expTableW * 0.30);
      const wAmount = Math.floor(expTableW * 0.20);
      const wMode = Math.max(1, expTableW - (wDate + wCategory + wDesc + wAmount));
      const expColW = { date: wDate, category: wCategory, description: wDesc, amount: wAmount, mode: wMode };
      const expHeaderH = 28;
      const expRowH = 32;
      const expPadX = 6;

      const drawExpDividers = (topY: number, h: number, color: string) => {
        doc.save();
        doc.strokeColor(color).lineWidth(1);
        let vx = expTableX + expColW.date;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        vx += expColW.category;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        vx += expColW.description;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        vx += expColW.amount;
        doc.moveTo(vx, topY).lineTo(vx, topY + h).stroke();
        doc.restore();
      };

      const drawExpHeader = () => {
        doc.save();
        doc.rect(expTableX, y, expTableW, expHeaderH).fillColor('#f3f4f6').fill();
        doc.restore();
        doc.rect(expTableX, y, expTableW, expHeaderH).strokeColor('#9ca3af').lineWidth(0.5).stroke();
        drawExpDividers(y, expHeaderH, '#9ca3af');
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        let cx2 = expTableX;
        doc.text('Date', cx2 + expPadX, y + 9, { width: expColW.date - expPadX * 2, align: 'left' });
        cx2 += expColW.date;
        doc.text('Category', cx2 + expPadX, y + 9, { width: expColW.category - expPadX * 2, align: 'left' });
        cx2 += expColW.category;
        doc.text('Description', cx2 + expPadX, y + 9, { width: expColW.description - expPadX * 2, align: 'left' });
        cx2 += expColW.description;
        doc.text('Amount (TSh)', cx2 + expPadX, y + 9, { width: expColW.amount - expPadX * 2, align: 'right' });
        cx2 += expColW.amount;
        doc.text('Payment Mode', cx2 + expPadX, y + 9, { width: expColW.mode - expPadX * 2, align: 'center' });
        y += expHeaderH;
      };

      drawExpHeader();
      doc.font('Helvetica').fontSize(10).fillColor('#000');

      const drawExpRow = (r: any, idx: number) => {
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(expTableX, y, expTableW, expRowH).fillColor('#f8fafc').fill();
          doc.restore();
        }
        doc.rect(expTableX, y, expTableW, expRowH).strokeColor('#9ca3af').lineWidth(0.5).stroke();
        drawExpDividers(y, expRowH, '#9ca3af');
        let cx2 = expTableX;
        drawCellText(doc, formatDdMmYyyy(r.date), cx2 + expPadX, y + 10, expColW.date - expPadX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx2 += expColW.date;
        drawCellTextBox(doc, String(r.category || ''), cx2 + expPadX, y + 8, expColW.category - expPadX * 2, expRowH - 16, { align: 'left', size: 9, font: 'Helvetica' });
        cx2 += expColW.category;
        // Wrap/trim long descriptions safely inside the cell.
        drawCellTextBox(doc, String(r.description || ''), cx2 + expPadX, y + 8, expColW.description - expPadX * 2, expRowH - 16, { align: 'left', size: 9, font: 'Helvetica' });
        cx2 += expColW.description;
        drawCellText(doc, formatNumberTz(r.amount), cx2 + expPadX, y + 10, expColW.amount - expPadX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx2 += expColW.amount;
        drawCellTextBox(doc, String(r.paymentMode || '-'), cx2 + expPadX, y + 8, expColW.mode - expPadX * 2, expRowH - 16, { align: 'center', size: 9, font: 'Helvetica' });
        y += expRowH;
      };

      let expIdx = 0;
      for (const r of input.expenseRows) {
        if (y + expRowH > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: 30 });
          y = doc.page.margins.top + 8;
          doc.font('Helvetica').fontSize(10).fillColor('#000');
        }
        drawExpRow(r, expIdx++);
      }

      // Expense total row
      const expTotalH = 36;
      if (y + expTotalH > bottomLimit()) {
        doc.addPage({ size: 'A4', margin: 30 });
        y = doc.page.margins.top + 8;
      }
      doc.moveTo(expTableX, y).lineTo(expTableX + expTableW, y).lineWidth(0.5).strokeColor('#9ca3af').stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(expTableX, y, expTableW, expTotalH).fillColor('#f3f4f6').fill();
      doc.restore();
      doc.rect(expTableX, y, expTableW, expTotalH).strokeColor('#9ca3af').lineWidth(0.5).stroke();
      drawExpDividers(y, expTotalH, '#9ca3af');
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('EXPENSE TOTAL', expTableX + expPadX, y + 11, { width: expColW.date + expColW.category + expColW.description - expPadX * 2, align: 'left' });
      doc.text(
        formatNumberTz(input.summary.totalExpenses),
        expTableX + expColW.date + expColW.category + expColW.description + expPadX,
        y + 11,
        { width: expColW.amount - expPadX * 2, align: 'right' },
      );
      y += expTotalH;

      // =========
      // SUMMARY
      // =========
      y += 18;
      drawSectionTitle('Summary');

      const boxPadding = 12;
      const boxX = x;
      const boxW = pageWidth;
      const boxTop = y;
      const boxH = 120;
      ensureSpace(boxH + 10);
      doc.save();
      doc.roundedRect(boxX, boxTop, boxW, boxH, 8).lineWidth(0.5).strokeColor('#9ca3af').fillColor('#f9fafb').fillAndStroke();
      doc.restore();

      let sy = boxTop + boxPadding;
      const labelX = boxX + boxPadding;
      const lineGap = 16;
      const kv = (label: string, value: string, bold = false, profitColor = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor('#374151').text(label, labelX, sy);
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(profitColor ? '#059669' : '#000').text(value, labelX, sy, { width: boxW - boxPadding * 2, align: 'right' });
        sy += lineGap;
      };

      kv('Total Net Revenue (TSh)', formatNumberTz(input.summary.totalNetSales));
      kv('Total VAT (TSh)', formatNumberTz(input.summary.totalVat));
      kv('Total Gross Revenue (TSh)', formatNumberTz(input.summary.totalGrossSales));
      kv('Total Expenses (TSh)', formatNumberTz(input.summary.totalExpenses));
      kv('Net Profit (TSh)', formatNumberTz(input.summary.netProfit), true, true);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

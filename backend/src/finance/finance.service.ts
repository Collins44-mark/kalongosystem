import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

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
    const [roomsAgg, barAgg, restAgg] = await Promise.all([
      this.prisma.booking.aggregate({
        where: {
          businessId,
          status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
          createdAt: { gte: from, lte: to },
        },
        _sum: { totalAmount: true },
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

    const roomsGross = Number(roomsAgg._sum.totalAmount || 0);
    const barGross = Number(barAgg._sum.totalAmount || 0);
    const restaurantGross = Number(restAgg._sum.totalAmount || 0);

    const roomsSplit = this.splitTaxFromGross(roomsGross, tax.enabled, tax.rateBySector.rooms);
    const barSplit = this.splitTaxFromGross(barGross, tax.enabled, tax.rateBySector.bar);
    const restaurantSplit = this.splitTaxFromGross(restaurantGross, tax.enabled, tax.rateBySector.restaurant);

    const grossSales = roomsGross + barGross + restaurantGross;
    const netRevenue = roomsSplit.net + barSplit.net + restaurantSplit.net;
    const vatCollected = roomsSplit.tax + barSplit.tax + restaurantSplit.tax;

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
    const txns = await this.collectTransactions(businessId, from, to, sector);
    const total = txns.length;
    const start = (page - 1) * pageSize;
    const rows = txns.slice(start, start + pageSize).map((r) => ({
      ...r,
      date: r.date.toISOString(),
    }));

    return { page, pageSize, total, rows };
  }

  private async collectTransactions(
    businessId: string,
    from: Date,
    to: Date,
    sector: 'all' | 'rooms' | 'bar' | 'restaurant',
  ) {
    const tax = await this.getTaxConfig(businessId);

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
      const bookings = await this.prisma.booking.findMany({
        where: {
          businessId,
          status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
          createdAt: { gte: from, lte: to },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, folioNumber: true, totalAmount: true, createdAt: true, paymentMode: true },
      });
      for (const b of bookings) {
        const gross = Number(b.totalAmount);
        const split = this.splitTaxFromGross(gross, tax.enabled, tax.rateBySector.rooms);
        const mode = b.paymentMode ? `${b.paymentMode} (Paid direct)` : 'Paid direct';
        txns.push({
          date: b.createdAt,
          referenceId: b.folioNumber || b.id,
          sector: 'rooms',
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
        select: { id: true, orderNumber: true, totalAmount: true, paymentMethod: true, createdAt: true },
      });
      for (const o of orders) {
        const gross = Number(o.totalAmount);
        const split = this.splitTaxFromGross(gross, tax.enabled, tax.rateBySector.bar);
        txns.push({
          date: o.createdAt,
          referenceId: o.orderNumber || o.id,
          sector: 'bar',
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.tax),
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
        const split = this.splitTaxFromGross(gross, tax.enabled, tax.rateBySector.restaurant);
        txns.push({
          date: o.createdAt,
          referenceId: o.orderNumber || o.id,
          sector: 'restaurant',
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
    sector: 'all' | 'rooms' | 'bar' | 'restaurant',
    format: 'csv' | 'xlsx' | 'pdf',
    generatedByRole: string = 'USER',
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
          t.sector === 'rooms' ? 'Room Revenue' : t.sector === 'bar' ? 'Bar Revenue' : 'Restaurant Revenue';

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
      select: { name: true, businessId: true, businessType: true },
    });

    const totalNet = txns.reduce((s, t) => s + Number(t.netAmount || 0), 0);
    const totalVat = txns.reduce((s, t) => s + Number(t.vatAmount || 0), 0);
    const totalGross = txns.reduce((s, t) => s + Number(t.grossAmount || 0), 0);

    const expAgg = await this.prisma.expense.aggregate({
      where: { businessId, expenseDate: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    const totalExpenses = Number(expAgg._sum.amount || 0);
    const netProfit = totalNet - totalExpenses;

    const breakdown = { cash: 0, bank: 0, mobileMoney: 0, other: 0 };
    for (const t of txns) {
      const mode = String(t.paymentMode || '');
      const m = mode.toLowerCase();
      const amt = Number(t.grossAmount || 0);
      if (m.includes('bank')) breakdown.bank += amt;
      else if (m.includes('mpesa') || m.includes('m-pesa') || m.includes('tigopesa') || m.includes('airtel') || m.includes('mobile')) breakdown.mobileMoney += amt;
      else if (m.includes('cash') || mode) breakdown.cash += amt;
      else breakdown.other += amt;
    }

    const pdf = await renderFinanceTransactionsPdf({
      businessName: business?.name || 'Business',
      businessId: business?.businessId || businessId,
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
        paymentBreakdown: {
          cash: round2(breakdown.cash),
          bank: round2(breakdown.bank),
          mobileMoney: round2(breakdown.mobileMoney),
          other: round2(breakdown.other),
        },
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
    });
    return { filename: `${baseName}.pdf`, contentType: 'application/pdf', body: pdf };
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

async function renderFinanceTransactionsPdf(input: {
  businessName: string;
  businessId: string;
  businessType: string;
  reportTitle: string;
  sector: 'all' | 'rooms' | 'bar' | 'restaurant';
  dateRange: { from: string; to: string };
  generatedAt: Date;
  generatedByRole: string;
  summary: {
    totalNetSales: number;
    totalVat: number;
    totalGrossSales: number;
    totalExpenses: number;
    netProfit: number;
    paymentBreakdown: { cash: number; bank: number; mobileMoney: number; other: number };
  };
  rows: Array<{ date: Date; reference: string; sector: string; net: number; vat: number; gross: number; paymentMode: string }>;
}): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => {
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          const footerY = doc.page.height - doc.page.margins.bottom + 10;
          doc.font('Helvetica').fontSize(8).fillColor('#555');
          doc.text(
            `System Generated Report • Business ID: ${input.businessId} • Page ${i + 1} of ${range.count}`,
            doc.page.margins.left,
            footerY,
            { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' },
          );
          doc.fillColor('#000');
        }
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      let y = doc.page.margins.top;

      // Header block
      doc.font('Helvetica-Bold').fontSize(18).text(input.businessName, x, y);
      y += 22;
      doc.font('Helvetica-Bold').fontSize(14).text(input.reportTitle, x, y);
      y += 18;

      doc.font('Helvetica').fontSize(10).fillColor('#333');
      doc.text(`Business ID: ${input.businessId}`, x, y); y += 14;
      doc.text(`Business Type: ${input.businessType}`, x, y); y += 14;
      if (input.sector !== 'all') { doc.text(`Sector: ${input.sector}`, x, y); y += 14; }
      doc.text(`Date Range: ${input.dateRange.from} to ${input.dateRange.to}`, x, y); y += 14;
      doc.text(`Generated: ${formatDateTime(input.generatedAt)} • Generated By: ${input.generatedByRole}`, x, y); y += 10;
      doc.fillColor('#000');

      y += 10;
      doc.moveTo(x, y).lineTo(x + pageWidth, y).lineWidth(1).strokeColor('#ccc').stroke();
      doc.strokeColor('#000');
      y += 16;

      // Summary box
      const boxPadding = 10;
      const boxX = x;
      const boxW = pageWidth;
      const boxTop = y;
      const boxH = 165;
      doc.save();
      doc.roundedRect(boxX, boxTop, boxW, boxH, 8).lineWidth(1).strokeColor('#d0d7de').fillColor('#fafafa').fillAndStroke();
      doc.restore();

      let sy = boxTop + boxPadding;
      const labelX = boxX + boxPadding;
      const lineGap = 14;

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('SUMMARY', labelX, sy);
      sy += 16;

      const kv = (label: string, value: string) => {
        doc.font('Helvetica').fontSize(10).fillColor('#000').text(label, labelX, sy);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(value, labelX, sy, { width: boxW - boxPadding * 2, align: 'right' });
        sy += lineGap;
      };

      kv('Total Net Sales', formatTsh(input.summary.totalNetSales));
      kv('Total VAT', formatTsh(input.summary.totalVat));
      kv('Total Gross Sales', formatTsh(input.summary.totalGrossSales));
      if (input.summary.totalExpenses > 0) kv('Total Expenses', formatTsh(input.summary.totalExpenses));
      if (input.summary.totalExpenses > 0) kv('Net Profit', formatTsh(input.summary.netProfit));

      sy += 6;
      doc.font('Helvetica-Bold').fontSize(10).text('Payment Mode Breakdown', labelX, sy);
      sy += 12;
      kv('Cash Total', formatTsh(input.summary.paymentBreakdown.cash));
      kv('Bank Total', formatTsh(input.summary.paymentBreakdown.bank));
      kv('Mobile Money Total', formatTsh(input.summary.paymentBreakdown.mobileMoney));
      kv('Other Total', formatTsh(input.summary.paymentBreakdown.other));

      y = boxTop + boxH + 18;

      // Transactions table
      // Column widths tuned to avoid wrapping on tablet/print
      const fixed = {
        date: 70, // fixed small width (DD/MM/YYYY)
        sector: 95, // medium (Rooms/Restaurant)
        net: 90, // medium
        vat: 85, // medium
        gross: 95, // medium
        mode: 130, // medium width
      };
      // Center the table inside page margins (avoid touching edges)
      const tableW = fixed.date + fixed.sector + fixed.net + fixed.vat + fixed.gross + fixed.mode;
      const tableX = x + Math.max(0, (pageWidth - tableW) / 2);
      const colW = { ...fixed };
      const padX = 8;
      const rowH = 24;
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 30;

      const drawHeaderRow = () => {
        doc.save();
        doc.rect(tableX, y, tableW, rowH).fillColor('#f1f5f9').fill();
        doc.restore();
        doc.rect(tableX, y, tableW, rowH).strokeColor('#d0d7de').lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        let cx = tableX;
        doc.text('Date', cx + padX, y + 7, { width: colW.date - padX * 2, align: 'left' });
        cx += colW.date;
        doc.text('Sector', cx + padX, y + 7, { width: colW.sector - padX * 2, align: 'left' });
        cx += colW.sector;
        doc.text('Net (TSh)', cx + padX, y + 7, { width: colW.net - padX * 2, align: 'right' });
        cx += colW.net;
        doc.text('VAT (TSh)', cx + padX, y + 7, { width: colW.vat - padX * 2, align: 'right' });
        cx += colW.vat;
        doc.text('Gross (TSh)', cx + padX, y + 7, { width: colW.gross - padX * 2, align: 'right' });
        cx += colW.gross;
        doc.text('Payment Mode', cx + padX, y + 7, { width: colW.mode - padX * 2, align: 'center' });
        y += rowH;
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
        // Row border
        doc.rect(tableX, y, tableW, rowH).strokeColor('#e5e7eb').lineWidth(1).stroke();
        let cx = tableX;
        const dateTxt = formatDdMmYyyy(r.date);
        drawCellText(doc, dateTxt, cx + padX, y + 7, colW.date - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.date;
        drawCellText(doc, formatSectorLabel(r.sector), cx + padX, y + 7, colW.sector - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.sector;
        drawCellText(doc, formatTsh(r.net), cx + padX, y + 7, colW.net - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.net;
        drawCellText(doc, formatTsh(r.vat), cx + padX, y + 7, colW.vat - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.vat;
        drawCellText(doc, formatTsh(r.gross), cx + padX, y + 7, colW.gross - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.gross;
        const modeLabel = formatPaymentModeLabel(String(r.paymentMode || ''));
        drawCellText(doc, modeLabel, cx + padX, y + 7, colW.mode - padX * 2, { align: 'center', baseSize: 10, minSize: 8, font: 'Helvetica' });
        y += rowH;
      };

      let rowIdx = 0;
      for (const r of input.rows) {
        if (y + rowH > bottomLimit) {
          doc.addPage();
          y = doc.page.margins.top;
          drawHeaderRow();
          doc.font('Helvetica').fontSize(9).fillColor('#000');
        }
        drawRow(r, rowIdx++);
      }

      // Totals row (accounting touch)
      const totalsRowH = 28;
      if (y + totalsRowH > bottomLimit) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeaderRow();
      }
      // Top border above totals row
      doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(2).strokeColor('#111827').stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(tableX, y, tableW, totalsRowH).fillColor('#e5e7eb').fill();
      doc.restore();
      doc.rect(tableX, y, tableW, totalsRowH).strokeColor('#d0d7de').lineWidth(1).stroke();

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      // Label spans Date + Sector columns
      doc.text('TOTALS', tableX + padX, y + 8, { width: colW.date + colW.sector - padX * 2, align: 'left' });
      let cx = tableX + colW.date + colW.sector;
      doc.text(formatTsh(input.summary.totalNetSales), cx + padX, y + 8, { width: colW.net - padX * 2, align: 'right' });
      cx += colW.net;
      doc.text(formatTsh(input.summary.totalVat), cx + padX, y + 8, { width: colW.vat - padX * 2, align: 'right' });
      cx += colW.vat;
      doc.text(formatTsh(input.summary.totalGrossSales), cx + padX, y + 8, { width: colW.gross - padX * 2, align: 'right' });
      // payment mode column left blank on totals
      y += totalsRowH;

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

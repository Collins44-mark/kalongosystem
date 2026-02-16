import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

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
    const tax = await this.getTaxConfig(businessId);

    const [roomsAgg, barAgg, restAgg] = await Promise.all([
      this.prisma.booking.aggregate({
        where: {
          businessId,
          status: 'CHECKED_OUT',
          checkOut: { gte: from, lte: to },
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
      const payments = await this.prisma.folioPayment.findMany({
        where: { booking: { businessId }, createdAt: { gte: from, lte: to } },
        include: { booking: { select: { id: true, folioNumber: true } } },
        orderBy: { createdAt: 'desc' },
      });
      for (const p of payments) {
        const gross = Number(p.amount);
        const split = this.splitTaxFromGross(gross, tax.enabled, tax.rateBySector.rooms);
        txns.push({
          date: p.createdAt,
          referenceId: p.bookingId,
          sector: 'rooms',
          netAmount: this.round2(split.net),
          vatAmount: this.round2(split.tax),
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

    const pdf = await renderPdf({
      title: 'Finance Transactions',
      subtitle: `Range: ${safe(from)} to ${safe(to)} | Sector: ${sector}`,
      columns: ['Date', 'Reference', 'Sector', 'Net', 'VAT', 'Gross', 'Mode'],
      rows: txns.map((t) => [
        formatDdMmYyyy(t.date),
        t.referenceId,
        t.sector,
        String(round2(t.netAmount)),
        String(round2(t.vatAmount)),
        String(round2(t.grossAmount)),
        t.paymentMode,
      ]),
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

async function renderPdf(input: { title: string; subtitle: string; columns: string[]; rows: string[][] }): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      doc.fontSize(16).text(input.title);
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#444').text(input.subtitle);
      doc.moveDown(0.8);
      doc.fillColor('#000');

      doc.fontSize(11).text(input.columns.join(' | '));
      doc.moveDown(0.2);
      doc.fontSize(10).text('-'.repeat(90));
      doc.moveDown(0.4);

      input.rows.forEach((r) => doc.text(r.join(' | ')));
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

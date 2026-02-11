import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private async getVatConfig(businessId: string): Promise<{ enabled: boolean; rate: number; type: 'inclusive' | 'exclusive' }> {
    const settings = await this.prisma.businessSetting.findMany({
      where: { businessId, key: { in: ['vat_enabled', 'vat_rate', 'vat_type'] } },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));
    const enabledRaw = map.get('vat_enabled');
    const enabled = enabledRaw === 'true' || enabledRaw === '1';
    const rateRaw = map.get('vat_rate');
    const rate = Math.max(0, Number(rateRaw ?? 0) || 0);
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
      for (const t of txns) {
        const date = formatDdMmYyyy(t.date);
        const cashAccount = mapPaymentAccount(t.paymentMode);
        const revenueAccount = t.sector === 'rooms' ? 'Room Revenue' : t.sector === 'bar' ? 'Bar Revenue' : 'Restaurant Revenue';
        const descBase = `${t.sector.toUpperCase()} ${t.referenceId}`;

        // Debit cash/bank/mobile for gross received
        lines.push([date, cashAccount, round2(t.grossAmount), 0, `${descBase} payment received`].map(csvEscape).join(','));
        // Credit revenue for net
        lines.push([date, revenueAccount, 0, round2(t.netAmount), `${descBase} revenue`].map(csvEscape).join(','));
        // Credit VAT payable
        if (round2(t.vatAmount) > 0) {
          lines.push([date, 'VAT Payable', 0, round2(t.vatAmount), `${descBase} VAT collected`].map(csvEscape).join(','));
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
      doc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e) => reject(e));

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

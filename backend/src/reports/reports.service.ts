import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { BarService } from '../bar/bar.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { WorkersService } from '../workers/workers.service';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => FinanceService))
    private finance: FinanceService,
    private bar: BarService,
    private restaurant: RestaurantService,
    private workers: WorkersService,
  ) {}

  async getSalesReport(
    businessId: string,
    branchId: string,
    from?: Date,
    to?: Date,
  ) {
    const barSales = await this.bar.getSalesTotal(
      businessId,
      from,
      to,
    );
    const restSales = await this.restaurant.getSalesTotal(
      businessId,
      from,
      to,
    );
    const hotelRevenue = await this.finance.getHotelRevenue(
      businessId,
      from,
      to,
    );
    return {
      bar: barSales,
      restaurant: restSales,
      hotel: hotelRevenue,
      total: barSales.total + restSales.total + hotelRevenue,
    };
  }

  async getFinanceReport(
    businessId: string,
    branchId: string,
    from?: Date,
    to?: Date,
  ) {
    return this.finance.getDashboard(
      businessId,
      branchId,
      from,
      to,
    );
  }

  async getPayrollReport(
    businessId: string,
    month: number,
    year: number,
  ) {
    return this.workers.getPayroll(businessId, month, year);
  }

  async getBookingsReport(businessId: string, branchId: string, from?: Date, to?: Date) {
    const where: any = { businessId, branchId };
    if (from || to) {
      where.checkIn = {};
      if (from) where.checkIn.gte = from;
      if (to) where.checkIn.lte = to;
    }
    return this.prisma.booking.findMany({
      where,
      include: { room: { include: { category: true } } },
      orderBy: { checkIn: 'desc' },
    });
  }

  async exportReport(
    businessId: string,
    branchId: string,
    reportType: string,
    format: string,
    sector: string,
    from?: Date,
    to?: Date,
  ): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const rt = reportType === 'expenses' || reportType === 'pnl' ? reportType : 'revenue';
    const fmt = format === 'xlsx' || format === 'pdf' ? format : 'csv';
    const sec = sector === 'bar' || sector === 'restaurant' || sector === 'hotel' ? sector : 'all';

    const safeDate = (d?: Date) => (d ? d.toISOString().slice(0, 10) : 'all');
    const baseName = `report-${rt}${rt === 'revenue' && sec !== 'all' ? `-${sec}` : ''}-${safeDate(from)}-${safeDate(to)}`;

    if (rt === 'revenue') {
      const sales = await this.getSalesReport(businessId, branchId, from, to);
      const bar = Number(sales.bar?.total ?? 0);
      const restaurant = Number(sales.restaurant?.total ?? 0);
      const hotel = Number(sales.hotel ?? 0);
      const rowsAll = [
        { sector: 'Bar', amount: bar },
        { sector: 'Restaurant', amount: restaurant },
        { sector: 'Hotel', amount: hotel },
      ];
      const rows =
        sec === 'bar'
          ? [{ sector: 'Bar', amount: bar }]
          : sec === 'restaurant'
            ? [{ sector: 'Restaurant', amount: restaurant }]
            : sec === 'hotel'
              ? [{ sector: 'Hotel', amount: hotel }]
              : rowsAll;
      const total = rows.reduce((s, r) => s + r.amount, 0);

      if (fmt === 'csv') {
        const csv =
          ['Sector,Amount (TZS)', ...rows.map((r) => `${csvEscape(r.sector)},${r.amount}`), `Total,${total}`].join('\n') +
          '\n';
        return {
          filename: `${baseName}.csv`,
          contentType: 'text/csv; charset=utf-8',
          body: Buffer.from(csv, 'utf8'),
        };
      }

      if (fmt === 'xlsx') {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Revenue');
        ws.columns = [
          { header: 'Sector', key: 'sector', width: 20 },
          { header: 'Amount (TZS)', key: 'amount', width: 18 },
        ];
        rows.forEach((r) => ws.addRow(r));
        ws.addRow({ sector: 'Total', amount: total });
        const buf: any = await wb.xlsx.writeBuffer();
        return {
          filename: `${baseName}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
        };
      }

      const pdf = await renderPdf({
        title: 'Revenue Report',
        subtitle: buildRangeSubtitle(from, to, sec === 'all' ? undefined : sec),
        columns: ['Sector', 'Amount (TZS)'],
        rows: [...rows.map((r) => [r.sector, String(r.amount)]), ['Total', String(total)]],
      });
      return { filename: `${baseName}.pdf`, contentType: 'application/pdf', body: pdf };
    }

    if (rt === 'expenses') {
      const exp = await this.finance.getExpenses(businessId, branchId, from, to);
      const rows = (exp.expenses ?? []).map((e: any) => ({
        date: e.expenseDate ? new Date(e.expenseDate).toISOString().slice(0, 10) : '',
        category: String(e.category ?? ''),
        description: String(e.description ?? ''),
        amount: Number(e.amount ?? 0),
      }));
      const total = Number(exp.total ?? rows.reduce((s, r) => s + r.amount, 0));

      if (fmt === 'csv') {
        const header = 'Date,Category,Description,Amount (TZS)';
        const lines = rows.map((r) =>
          [r.date, r.category, r.description, String(r.amount)].map(csvEscape).join(','),
        );
        const csv = [header, ...lines, ['', '', 'Total', String(total)].map(csvEscape).join(',')].join('\n') + '\n';
        return {
          filename: `${baseName}.csv`,
          contentType: 'text/csv; charset=utf-8',
          body: Buffer.from(csv, 'utf8'),
        };
      }

      if (fmt === 'xlsx') {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Expenses');
        ws.columns = [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Category', key: 'category', width: 18 },
          { header: 'Description', key: 'description', width: 34 },
          { header: 'Amount (TZS)', key: 'amount', width: 18 },
        ];
        rows.forEach((r) => ws.addRow(r));
        ws.addRow({ date: '', category: '', description: 'Total', amount: total });
        const buf: any = await wb.xlsx.writeBuffer();
        return {
          filename: `${baseName}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
        };
      }

      const pdf = await renderPdf({
        title: 'Expenses Report',
        subtitle: buildRangeSubtitle(from, to),
        columns: ['Date', 'Category', 'Description', 'Amount (TZS)'],
        rows: [
          ...rows.map((r) => [r.date, r.category, r.description, String(r.amount)]),
          ['', '', 'Total', String(total)],
        ],
      });
      return { filename: `${baseName}.pdf`, contentType: 'application/pdf', body: pdf };
    }

    // P&L
    const dash = await this.finance.getDashboard(businessId, branchId, from, to);
    const revenue = Number((dash as any).totalRevenue ?? 0);
    const expenses = Number((dash as any).totalExpenses ?? 0);
    const netProfit = Number((dash as any).netProfit ?? revenue - expenses);
    const pnlRows = [
      { item: 'Revenue', amount: revenue },
      { item: 'Expenses', amount: expenses },
      { item: 'Net Profit', amount: netProfit },
    ];

    if (fmt === 'csv') {
      const csv =
        ['Item,Amount (TZS)', ...pnlRows.map((r) => `${csvEscape(r.item)},${r.amount}`)].join('\n') + '\n';
      return {
        filename: `${baseName}.csv`,
        contentType: 'text/csv; charset=utf-8',
        body: Buffer.from(csv, 'utf8'),
      };
    }

    if (fmt === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('P&L');
      ws.columns = [
        { header: 'Item', key: 'item', width: 18 },
        { header: 'Amount (TZS)', key: 'amount', width: 18 },
      ];
      pnlRows.forEach((r) => ws.addRow(r));
      const buf: any = await wb.xlsx.writeBuffer();
      return {
        filename: `${baseName}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
      };
    }

    const pdf = await renderPdf({
      title: 'P&L Report',
      subtitle: buildRangeSubtitle(from, to),
      columns: ['Item', 'Amount (TZS)'],
      rows: pnlRows.map((r) => [r.item, String(r.amount)]),
    });
    return { filename: `${baseName}.pdf`, contentType: 'application/pdf', body: pdf };
  }
}

function csvEscape(v: string) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildRangeSubtitle(from?: Date, to?: Date, sector?: string) {
  const f = from ? from.toISOString().slice(0, 10) : '';
  const t = to ? to.toISOString().slice(0, 10) : '';
  const range = f || t ? `Range: ${f || '...'} to ${t || '...'}` : 'Range: All time';
  return sector ? `${range} | Sector: ${sector}` : range;
}

async function renderPdf(input: {
  title: string;
  subtitle: string;
  columns: string[];
  rows: string[][];
}): Promise<Buffer> {
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

      input.rows.forEach((r) => {
        doc.text(r.join(' | '));
      });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

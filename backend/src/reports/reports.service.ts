import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { BarService } from '../bar/bar.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { WorkersService } from '../workers/workers.service';

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
    generatedBy: string = 'User',
  ): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const rtRaw = String(reportType || '').toLowerCase();
    const rt =
      rtRaw === 'sales' || rtRaw === 'revenue'
        ? 'sales'
        : rtRaw === 'tax'
          ? 'tax'
          : rtRaw === 'expenses'
            ? 'expenses'
            : 'pnl';
    const fmt = format === 'xlsx' || format === 'pdf' ? format : 'csv';
    const sec = sector === 'rooms' || sector === 'bar' || sector === 'restaurant' ? sector : 'all';

    const safeDate = (d?: Date) => (d ? d.toISOString().slice(0, 10) : 'all');
    const baseName = `report-${rt}${sec !== 'all' ? `-${sec}` : ''}-${safeDate(from)}-${safeDate(to)}`;

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, businessId: true, businessType: true },
    });
    const businessName = business?.name || 'Business';
    const businessDisplayId = business?.businessId || businessId;
    const businessType = business?.businessType || '-';

    if (rt === 'sales') {
      const txns = await this.finance.collectTransactions(
        businessId,
        from ?? new Date(0),
        to ?? new Date(),
        sec === 'all' ? 'all' : (sec as any),
      );
      const totalNet = txns.reduce((s: number, t: any) => s + Number(t.netAmount || 0), 0);
      const totalVat = txns.reduce((s: number, t: any) => s + Number(t.vatAmount || 0), 0);
      const totalGross = txns.reduce((s: number, t: any) => s + Number(t.grossAmount || 0), 0);

      if (fmt === 'csv') {
        const exportDate = formatIsoDate(new Date());
        const header = 'Date,Transaction_Type,Sector,Customer_Name,Net,VAT,Gross,Payment_Mode,Reference';
        const rows = [...txns]
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map((t: any) => {
            const date = formatIsoDate(new Date(t.date));
            const sector = normalizeSector(t.sector);
            const reference = String(t.referenceId ?? '').trim() || 'UNKNOWN';
            const customerName = defaultCustomerNameForSector(sector, t.customerName);
            const paymentMode = normalizePaymentModeCsvStrict(t.paymentMode);
            const netC = cents2(t.netAmount);
            const vatC = cents2(t.vatAmount);
            const grossC = cents2(t.grossAmount);
            if (netC + vatC !== grossC) {
              throw new BadRequestException(`Invalid sale export amounts for ${reference}: Net+VAT must equal Gross`);
            }
            return [
              date,
              'Sale',
              sector,
              customerName,
              numberCsv0(t.netAmount),
              numberCsv0(t.vatAmount),
              numberCsv0(t.grossAmount),
              paymentMode,
              reference,
            ].map(csvEscape).join(',');
          });
        const csv = [header, ...rows].join('\n') + '\n';
        return {
          filename: `sales-report-${exportDate}.csv`,
          contentType: 'text/csv',
          body: Buffer.from(csv, 'utf8'),
        };
      }

      if (fmt === 'xlsx') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Sales');
        const exportDate = formatIsoDate(new Date());

        ws.columns = [
          { header: 'Date', key: 'date', width: 12 },
          { header: 'Transaction_Type', key: 'transactionType', width: 16 },
          { header: 'Sector', key: 'sector', width: 14 },
          { header: 'Customer_Name', key: 'customerName', width: 26 },
          { header: 'Net', key: 'net', width: 14 },
          { header: 'VAT', key: 'vat', width: 14 },
          { header: 'Gross', key: 'gross', width: 14 },
          { header: 'Payment_Mode', key: 'paymentMode', width: 16 },
          { header: 'Reference', key: 'reference', width: 22 },
        ];

        // Freeze top row and add filters
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: 'A1', to: 'I1' };

        // Header styling
        const headerRow = ws.getRow(1);
        headerRow.height = 18;
        headerRow.eachCell((cell: any) => {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        });

        // Column formatting
        ws.getColumn('date').numFmt = 'yyyy-mm-dd';
        for (const k of ['net', 'vat', 'gross']) {
          const col = ws.getColumn(k);
          col.numFmt = '#,##0.00';
          col.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        for (const k of ['transactionType', 'sector', 'customerName', 'paymentMode', 'reference']) {
          ws.getColumn(k).alignment = { horizontal: 'left', vertical: 'middle' };
        }

        // Row export + validation
        const ordered = [...txns].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        ordered.forEach((t: any) => {
          const sector = normalizeSector(t.sector);
          const reference = String(t.referenceId ?? '').trim() || 'UNKNOWN';
          const customerName = defaultCustomerNameForSector(sector, t.customerName);
          const paymentMode = normalizePaymentModeCsvStrict(t.paymentMode);
          const net = Number(t.netAmount ?? 0);
          const vat = Number(t.vatAmount ?? 0);
          const gross = Number(t.grossAmount ?? 0);
          const netC = cents2(net);
          const vatC = cents2(vat);
          const grossC = cents2(gross);
          if (netC + vatC !== grossC) {
            throw new BadRequestException(`Invalid sale export amounts for ${reference}: Net+VAT must equal Gross`);
          }

          ws.addRow({
            date: new Date(t.date),
            transactionType: 'Sale',
            sector,
            customerName,
            net,
            vat,
            gross,
            paymentMode,
            reference,
          });
        });

        // Totals row (accountant-ready)
        const totalRow = ws.addRow({
          date: null,
          transactionType: null,
          sector: null,
          customerName: 'TOTAL SALES',
          net: totalNet,
          vat: totalVat,
          gross: totalGross,
          paymentMode: null,
          reference: null,
        });
        totalRow.height = 18;
        totalRow.eachCell((cell: any) => {
          cell.font = { bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
          cell.alignment = cell.alignment || { vertical: 'middle' };
          cell.border = {
            top: { style: 'medium', color: { argb: 'FF9CA3AF' } },
          };
        });

        // Auto-fit columns
        ws.columns.forEach((col: any) => {
          const header = String(col.header ?? '');
          let max = header.length;
          col.eachCell({ includeEmpty: false }, (cell: any) => {
            const v = cell.value;
            let len = 0;
            if (v == null) len = 0;
            else if (typeof v === 'string') len = v.length;
            else if (v instanceof Date) len = 10;
            else if (typeof v === 'number') len = String(v.toFixed(2)).length;
            else len = String(v).length;
            if (len > max) max = len;
          });
          col.width = Math.min(42, Math.max(10, max + 2));
        });

        const buf: any = await wb.xlsx.writeBuffer();
        return {
          filename: `sales-report-${exportDate}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
        };
      }

      const pdf = await renderSalesPdf({
        businessName,
        businessId: businessDisplayId,
        businessType,
        branchId,
        dateRange: { from, to },
        generatedAt: new Date(),
        generatedBy,
        sector: sec,
        rows: txns.map((t: any) => ({
          date: t.date,
          sector: t.sector,
          net: t.netAmount,
          vat: t.vatAmount,
          gross: t.grossAmount,
          paymentMode: t.paymentMode,
        })),
        totals: { net: totalNet, vat: totalVat, gross: totalGross },
      });
      return { filename: `${baseName}.pdf`, contentType: 'application/pdf', body: pdf };
    }

    if (rt === 'tax') {
      const txns = await this.finance.collectTransactions(
        businessId,
        from ?? new Date(0),
        to ?? new Date(),
        sec === 'all' ? 'all' : (sec as any),
      );
      const totalNet = txns.reduce((s: number, t: any) => s + Number(t.netAmount || 0), 0);
      const totalVat = txns.reduce((s: number, t: any) => s + Number(t.vatAmount || 0), 0);
      const totalGross = txns.reduce((s: number, t: any) => s + Number(t.grossAmount || 0), 0);

      if (fmt === 'csv') {
        const exportDate = formatIsoDate(new Date());
        const header = 'Date,Sector,Net,VAT,Gross';
        const rows = [...txns]
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map((t: any) => [
            formatIsoDate(new Date(t.date)),
            String(t.sector ?? ''),
            numberCsv0(t.netAmount),
            numberCsv0(t.vatAmount),
            numberCsv0(t.grossAmount),
          ].map(csvEscape).join(','));
        const csv = [header, ...rows].join('\n') + '\n';
        return {
          filename: `tax-report-${exportDate}.csv`,
          contentType: 'text/csv; charset=utf-8',
          body: Buffer.from(csv, 'utf8'),
        };
      }

      if (fmt === 'xlsx') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Tax');
        ws.columns = [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Sector', key: 'sector', width: 14 },
          { header: 'Net (TSh)', key: 'net', width: 16 },
          { header: 'VAT (TSh)', key: 'vat', width: 16 },
          { header: 'Gross (TSh)', key: 'gross', width: 16 },
        ];
        txns.forEach((t: any) => ws.addRow({
          date: formatDdMmYyyy(t.date),
          sector: t.sector,
          net: round0(t.netAmount),
          vat: round0(t.vatAmount),
          gross: round0(t.grossAmount),
        }));
        ws.addRow({ date: '', sector: 'TOTAL TAX', net: round0(totalNet), vat: round0(totalVat), gross: round0(totalGross) });
        const buf: any = await wb.xlsx.writeBuffer();
        return {
          filename: `${baseName}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
        };
      }

      const pdf = await renderTaxPdf({
        businessName,
        businessId: businessDisplayId,
        businessType,
        branchId,
        dateRange: { from, to },
        generatedAt: new Date(),
        generatedBy,
        sector: sec,
        rows: txns.map((t: any) => ({
          date: t.date,
          sector: t.sector,
          net: t.netAmount,
          vat: t.vatAmount,
          gross: t.grossAmount,
        })),
        totals: { net: totalNet, vat: totalVat, gross: totalGross },
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
        reference: String(e.id ?? ''),
      }));
      const total = Number(exp.total ?? rows.reduce((s, r) => s + r.amount, 0));

      if (fmt === 'csv') {
        const exportDate = formatIsoDate(new Date());
        const header = 'Date,Transaction_Type,Category,Description,Amount,Payment_Mode,Reference';
        const lines = [...rows]
          .filter((r) => Boolean(r.date))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map((r) =>
            [
              r.date,
              'Expense',
              r.category,
              r.description,
              numberCsv0(r.amount),
              'CASH',
              r.reference,
            ].map(csvEscape).join(','),
          );
        const csv = [header, ...lines].join('\n') + '\n';
        return {
          filename: `expense-report-${exportDate}.csv`,
          contentType: 'text/csv; charset=utf-8',
          body: Buffer.from(csv, 'utf8'),
        };
      }

      if (fmt === 'xlsx') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Expenses');
        ws.columns = [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Category', key: 'category', width: 18 },
          { header: 'Description', key: 'description', width: 34 },
          { header: 'Amount (TSh)', key: 'amount', width: 18 },
          { header: 'Payment Mode', key: 'paymentMode', width: 18 },
        ];
        rows.forEach((r) => ws.addRow({ ...r, amount: round0(r.amount), paymentMode: '-' }));
        ws.addRow({ date: '', category: '', description: 'TOTAL EXPENSES', amount: round0(total), paymentMode: '' });
        const buf: any = await wb.xlsx.writeBuffer();
        return {
          filename: `${baseName}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
        };
      }

      const pdf = await renderExpensesPdf({
        businessName,
        businessId: businessDisplayId,
        businessType,
        branchId,
        dateRange: { from, to },
        generatedAt: new Date(),
        generatedBy,
        rows: rows.map((r) => ({
          date: r.date ? new Date(r.date) : new Date(),
          category: r.category,
          description: r.description,
          amount: r.amount,
          paymentMode: '-',
        })),
        total,
      });
      return { filename: `${baseName}.pdf`, contentType: 'application/pdf', body: pdf };
    }

    // P&L
    const txns = await this.finance.collectTransactions(
      businessId,
      from ?? new Date(0),
      to ?? new Date(),
      sec === 'all' ? 'all' : (sec as any),
    );
    const exp = await this.finance.getExpenses(businessId, branchId, from, to);
    const expRows = (exp.expenses ?? []).map((e: any) => ({
      date: new Date(e.expenseDate),
      category: String(e.category ?? ''),
      description: String(e.description ?? ''),
      amount: Number(e.amount ?? 0),
      paymentMode: '-',
    }));
    const totalNet = txns.reduce((s: number, t: any) => s + Number(t.netAmount || 0), 0);
    const totalVat = txns.reduce((s: number, t: any) => s + Number(t.vatAmount || 0), 0);
    const totalGross = txns.reduce((s: number, t: any) => s + Number(t.grossAmount || 0), 0);
    const totalExpenses = Number(exp.total ?? expRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0));
    const netProfit = totalNet - totalExpenses;

    if (fmt === 'csv') {
      const lines: string[] = [];
      lines.push('SECTION,Date,Sector,Net (TSh),VAT (TSh),Gross (TSh),Payment Mode');
      for (const t of txns) {
        lines.push(['SALES', formatDdMmYyyy(t.date), t.sector, String(round0(t.netAmount)), String(round0(t.vatAmount)), String(round0(t.grossAmount)), String(t.paymentMode || '')].map(csvEscape).join(','));
      }
      lines.push(['TOTAL SALES', '', '', String(round0(totalNet)), String(round0(totalVat)), String(round0(totalGross)), ''].map(csvEscape).join(','));
      lines.push('');
      lines.push('SECTION,Date,Category,Description,Amount (TSh),Payment Mode');
      for (const r of expRows) {
        lines.push(['EXPENSE', formatDdMmYyyy(r.date), r.category, r.description, String(round0(r.amount)), '-'].map(csvEscape).join(','));
      }
      lines.push(['TOTAL EXPENSES', '', '', '', String(round0(totalExpenses)), ''].map(csvEscape).join(','));
      lines.push('');
      lines.push('SUMMARY,Total Net (TSh),Total VAT (TSh),Total Gross (TSh),Total Expenses (TSh),Net Profit (Net - Expenses) (TSh)');
      lines.push(['SUMMARY', String(round0(totalNet)), String(round0(totalVat)), String(round0(totalGross)), String(round0(totalExpenses)), String(round0(netProfit))].map(csvEscape).join(','));
      const csv = lines.join('\n') + '\n';
      return { filename: `${baseName}.csv`, contentType: 'text/csv; charset=utf-8', body: Buffer.from(csv, 'utf8') };
    }

    if (fmt === 'xlsx') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();

      const wsSum = wb.addWorksheet('Summary');
      wsSum.columns = [
        { header: 'Metric', key: 'metric', width: 26 },
        { header: 'Amount (TSh)', key: 'amount', width: 20 },
      ];
      wsSum.addRow({ metric: 'Total Net Revenue', amount: round0(totalNet) });
      wsSum.addRow({ metric: 'Total VAT', amount: round0(totalVat) });
      wsSum.addRow({ metric: 'Total Gross Revenue', amount: round0(totalGross) });
      wsSum.addRow({ metric: 'Total Expenses', amount: round0(totalExpenses) });
      wsSum.addRow({ metric: 'Net Profit (Net Revenue - Expenses)', amount: round0(netProfit) });

      const wsSales = wb.addWorksheet('Sales');
      wsSales.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Sector', key: 'sector', width: 14 },
        { header: 'Net (TSh)', key: 'net', width: 16 },
        { header: 'VAT (TSh)', key: 'vat', width: 16 },
        { header: 'Gross (TSh)', key: 'gross', width: 16 },
        { header: 'Payment Mode', key: 'paymentMode', width: 22 },
      ];
      txns.forEach((t: any) => wsSales.addRow({
        date: formatDdMmYyyy(t.date),
        sector: t.sector,
        net: round0(t.netAmount),
        vat: round0(t.vatAmount),
        gross: round0(t.grossAmount),
        paymentMode: t.paymentMode,
      }));
      wsSales.addRow({ date: '', sector: 'TOTAL SALES', net: round0(totalNet), vat: round0(totalVat), gross: round0(totalGross), paymentMode: '' });

      const wsExp = wb.addWorksheet('Expenses');
      wsExp.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Description', key: 'description', width: 34 },
        { header: 'Amount (TSh)', key: 'amount', width: 18 },
        { header: 'Payment Mode', key: 'paymentMode', width: 18 },
      ];
      expRows.forEach((r: any) => wsExp.addRow({
        date: formatDdMmYyyy(r.date),
        category: r.category,
        description: r.description,
        amount: round0(r.amount),
        paymentMode: '-',
      }));
      wsExp.addRow({ date: '', category: '', description: 'TOTAL EXPENSES', amount: round0(totalExpenses), paymentMode: '' });

      const buf: any = await wb.xlsx.writeBuffer();
      return {
        filename: `${baseName}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
      };
    }

    const pdf = await renderPnlPdf({
      businessName,
      businessId: businessDisplayId,
      businessType,
      branchId,
      dateRange: { from, to },
      generatedAt: new Date(),
      generatedBy,
      sector: sec,
      salesRows: txns.map((t: any) => ({
        date: t.date,
        sector: t.sector,
        net: t.netAmount,
        vat: t.vatAmount,
        gross: t.grossAmount,
        paymentMode: t.paymentMode,
      })),
      expenseRows: expRows,
      totals: { net: totalNet, vat: totalVat, gross: totalGross, expenses: totalExpenses, netProfit },
    });
    return { filename: `${baseName}.pdf`, contentType: 'application/pdf', body: pdf };
  }
}

function csvEscape(v: string) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function round0(n: number) {
  return Math.round(Number(n || 0));
}

function formatDdMmYyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatNumberTz(n: number) {
  const v = Number(n || 0);
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(Math.round(v));
}

function formatIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function numberCsv0(n: any) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  return String(Math.round(v));
}

function normalizeSector(input: any): 'ROOMS' | 'BAR' | 'RESTAURANT' {
  const raw = String(input ?? '').trim().toLowerCase();
  if (raw === 'rooms' || raw === 'room') return 'ROOMS';
  if (raw === 'bar') return 'BAR';
  return 'RESTAURANT';
}

function defaultCustomerNameForSector(sector: 'ROOMS' | 'BAR' | 'RESTAURANT', raw: any) {
  const name = String(raw ?? '').trim();
  if (name) return name;
  if (sector === 'BAR') return 'Bar Walk-in Customer';
  if (sector === 'RESTAURANT') return 'Restaurant Walk-in Customer';
  return 'UNKNOWN';
}

function cents2(n: any) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100);
}

function normalizePaymentModeCsvStrict(input: any): 'CASH' | 'BANK' | 'MOBILE_MONEY' {
  const raw = String(input ?? '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

  if (!raw) throw new BadRequestException('Payment method is required');
  if (raw.includes('CASH')) return 'CASH';
  if (raw.includes('BANK') || raw.includes('TRANSFER') || raw.includes('EFT')) return 'BANK';
  if (
    raw.includes('MOBILE') ||
    raw.includes('MPESA') ||
    raw.includes('M-PESA') ||
    raw.includes('TIGO') ||
    raw.includes('AIRTEL') ||
    raw.includes('HALOPESA')
  ) {
    return 'MOBILE_MONEY';
  }
  throw new BadRequestException('Invalid payment method');
}

function formatDateTime(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function applyPageFooter(doc: any) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - doc.page.margins.bottom - 14;
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280');
    doc.text('Generated by HMS System', x, footerY, { width: pageWidth / 2, align: 'left' });
    doc.text(`Page ${i + 1} of ${range.count}`, x, footerY, { width: pageWidth, align: 'right' });
    doc.fillColor('#000');
  }
}

function drawHeaderBlock(doc: any, input: {
  title: string;
  businessName: string;
  businessId: string;
  businessType: string;
  branchId: string;
  dateRange: { from?: Date; to?: Date };
  generatedAt: Date;
  generatedBy: string;
}) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const top = doc.page.margins.top;
  const rightX = x + Math.floor(pageWidth * 0.58);
  const rightW = x + pageWidth - rightX;
  const leftW = rightX - x - 10;

  let y = top;
  doc.font('Helvetica-Bold').fontSize(21).fillColor('#111827').text(input.title, x, y, { width: leftW, align: 'left' });
  y += 26;
  doc.font('Helvetica').fontSize(10).fillColor('#374151');
  doc.text(input.businessName, x, y, { width: leftW, align: 'left' }); y += 13;
  doc.text(`Business ID: ${input.businessId}`, x, y, { width: leftW, align: 'left' }); y += 13;
  doc.text(`Branch ID: ${input.branchId}`, x, y, { width: leftW, align: 'left' }); y += 13;
  doc.text(`Business Type: ${input.businessType}`, x, y, { width: leftW, align: 'left' }); y += 13;
  const f = input.dateRange.from ? input.dateRange.from.toISOString().slice(0, 10) : '';
  const t = input.dateRange.to ? input.dateRange.to.toISOString().slice(0, 10) : '';
  doc.text(`Date Range: ${f} to ${t}`, x, y, { width: leftW, align: 'left' });

  doc.font('Helvetica').fontSize(10).fillColor('#374151');
  doc.text(`Generated On: ${formatDateTime(input.generatedAt)}`, rightX, top + 6, { width: rightW, align: 'right' });
  doc.text(`Generated By: ${input.generatedBy}`, rightX, top + 20, { width: rightW, align: 'right' });

  const dividerY = top + 92;
  doc.moveTo(x, dividerY).lineTo(x + pageWidth, dividerY).lineWidth(1).strokeColor('#e5e7eb').stroke();
  doc.strokeColor('#000');
  doc.fillColor('#000');
  return dividerY + 16;
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

function drawCellText(
  doc: any,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: { align: 'left' | 'right' | 'center'; baseSize: number; minSize: number; font?: string },
) {
  const t = String(text ?? '');
  if (opts.font) doc.font(opts.font);
  const size = fitFontSize(doc, t, Math.max(1, width), opts.baseSize, opts.minSize);
  doc.fontSize(size);
  doc.text(t, x, y, { width, align: opts.align, lineBreak: false });
}

async function renderSalesPdf(input: {
  businessName: string;
  businessId: string;
  businessType: string;
  branchId: string;
  dateRange: { from?: Date; to?: Date };
  generatedAt: Date;
  generatedBy: string;
  sector: string;
  rows: Array<{ date: Date; sector: string; net: number; vat: number; gross: number; paymentMode: string }>;
  totals: { net: number; vat: number; gross: number };
}): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      let y = drawHeaderBlock(doc, {
        title: 'Sales Report',
        businessName: input.businessName,
        businessId: input.businessId,
        businessType: input.businessType,
        branchId: input.branchId,
        dateRange: input.dateRange,
        generatedAt: input.generatedAt,
        generatedBy: input.generatedBy,
      });

      const fixed = { date: 70, mode: 120 };
      const remaining = pageWidth - fixed.date - fixed.mode;
      const colW = { date: fixed.date, sector: 90, net: 80, vat: 70, gross: remaining - (90 + 80 + 70), mode: fixed.mode };
      const tableW = colW.date + colW.sector + colW.net + colW.vat + colW.gross + colW.mode;
      const tableX = x + (pageWidth - tableW) / 2;
      const padX = 6;
      const headerH = 28;
      const rowH = 24;
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;

      const drawDividers = (topY: number, h: number, color: string) => {
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

      const drawHeader = () => {
        doc.save();
        doc.rect(tableX, y, tableW, headerH).fillColor('#f3f4f6').fill();
        doc.restore();
        doc.rect(tableX, y, tableW, headerH).strokeColor('#d0d7de').lineWidth(1).stroke();
        drawDividers(y, headerH, '#d0d7de');
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

      drawHeader();
      doc.font('Helvetica').fontSize(10).fillColor('#000');

      let idx = 0;
      for (const r of input.rows) {
        if (y + rowH > bottomLimit()) {
          doc.addPage();
          y = drawHeaderBlock(doc, {
            title: 'Sales Report',
            businessName: input.businessName,
            businessId: input.businessId,
            businessType: input.businessType,
            branchId: input.branchId,
            dateRange: input.dateRange,
            generatedAt: input.generatedAt,
            generatedBy: input.generatedBy,
          });
          drawHeader();
        }
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(tableX, y, tableW, rowH).fillColor('#f8fafc').fill();
          doc.restore();
        }
        doc.rect(tableX, y, tableW, rowH).strokeColor('#e5e7eb').lineWidth(1).stroke();
        drawDividers(y, rowH, '#e5e7eb');
        let cx = tableX;
        drawCellText(doc, formatDdMmYyyy(r.date), cx + padX, y + 7, colW.date - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.date;
        drawCellText(doc, String(r.sector), cx + padX, y + 7, colW.sector - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.sector;
        drawCellText(doc, formatNumberTz(r.net), cx + padX, y + 7, colW.net - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.net;
        drawCellText(doc, formatNumberTz(r.vat), cx + padX, y + 7, colW.vat - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.vat;
        drawCellText(doc, formatNumberTz(r.gross), cx + padX, y + 7, colW.gross - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.gross;
        drawCellText(doc, String(r.paymentMode || ''), cx + padX, y + 7, colW.mode - padX * 2, { align: 'center', baseSize: 10, minSize: 8, font: 'Helvetica' });
        y += rowH;
        idx += 1;
      }

      const totalsH = 36;
      if (y + totalsH > bottomLimit()) {
        doc.addPage();
        y = drawHeaderBlock(doc, {
          title: 'Sales Report',
          businessName: input.businessName,
          businessId: input.businessId,
          businessType: input.businessType,
          branchId: input.branchId,
          dateRange: input.dateRange,
          generatedAt: input.generatedAt,
          generatedBy: input.generatedBy,
        });
        drawHeader();
      }
      doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(3).strokeColor('#111827').stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(tableX, y, tableW, totalsH).fillColor('#e5e7eb').fill();
      doc.restore();
      doc.rect(tableX, y, tableW, totalsH).strokeColor('#d0d7de').lineWidth(1).stroke();
      drawDividers(y, totalsH, '#d0d7de');
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('TOTAL SALES', tableX + padX, y + 11, { width: colW.date + colW.sector - padX * 2, align: 'left', lineBreak: false });
      let cx = tableX + colW.date + colW.sector;
      doc.text(formatNumberTz(input.totals.net), cx + padX, y + 11, { width: colW.net - padX * 2, align: 'right' });
      cx += colW.net;
      doc.text(formatNumberTz(input.totals.vat), cx + padX, y + 11, { width: colW.vat - padX * 2, align: 'right' });
      cx += colW.vat;
      doc.text(formatNumberTz(input.totals.gross), cx + padX, y + 11, { width: colW.gross - padX * 2, align: 'right' });

      applyPageFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function renderTaxPdf(input: {
  businessName: string;
  businessId: string;
  businessType: string;
  branchId: string;
  dateRange: { from?: Date; to?: Date };
  generatedAt: Date;
  generatedBy: string;
  sector: string;
  rows: Array<{ date: Date; sector: string; net: number; vat: number; gross: number }>;
  totals: { net: number; vat: number; gross: number };
}): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      let y = drawHeaderBlock(doc, {
        title: 'Tax Report',
        businessName: input.businessName,
        businessId: input.businessId,
        businessType: input.businessType,
        branchId: input.branchId,
        dateRange: input.dateRange,
        generatedAt: input.generatedAt,
        generatedBy: input.generatedBy,
      });
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;

      const fixed = { date: 70, sector: 110 };
      const remaining = pageWidth - fixed.date - fixed.sector;
      const third = Math.floor(remaining / 3);
      const colW = { date: fixed.date, sector: fixed.sector, net: third, vat: third, gross: remaining - third * 2 };
      const tableW = colW.date + colW.sector + colW.net + colW.vat + colW.gross;
      const tableX = x + (pageWidth - tableW) / 2;
      const padX = 6;
      const headerH = 28;
      const rowH = 24;

      const drawDividers = (topY: number, h: number, color: string) => {
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
        doc.restore();
      };

      const drawHeader = () => {
        doc.save();
        doc.rect(tableX, y, tableW, headerH).fillColor('#f3f4f6').fill();
        doc.restore();
        doc.rect(tableX, y, tableW, headerH).strokeColor('#d0d7de').lineWidth(1).stroke();
        drawDividers(y, headerH, '#d0d7de');
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
        y += headerH;
      };

      drawHeader();
      doc.font('Helvetica').fontSize(10).fillColor('#000');

      let idx = 0;
      for (const r of input.rows) {
        if (y + rowH > bottomLimit()) {
          doc.addPage();
          y = drawHeaderBlock(doc, {
            title: 'Tax Report',
            businessName: input.businessName,
            businessId: input.businessId,
            businessType: input.businessType,
            branchId: input.branchId,
            dateRange: input.dateRange,
            generatedAt: input.generatedAt,
            generatedBy: input.generatedBy,
          });
          drawHeader();
        }
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(tableX, y, tableW, rowH).fillColor('#f8fafc').fill();
          doc.restore();
        }
        doc.rect(tableX, y, tableW, rowH).strokeColor('#e5e7eb').lineWidth(1).stroke();
        drawDividers(y, rowH, '#e5e7eb');
        let cx = tableX;
        drawCellText(doc, formatDdMmYyyy(r.date), cx + padX, y + 7, colW.date - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.date;
        drawCellText(doc, String(r.sector), cx + padX, y + 7, colW.sector - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.sector;
        drawCellText(doc, formatNumberTz(r.net), cx + padX, y + 7, colW.net - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.net;
        drawCellText(doc, formatNumberTz(r.vat), cx + padX, y + 7, colW.vat - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.vat;
        drawCellText(doc, formatNumberTz(r.gross), cx + padX, y + 7, colW.gross - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        y += rowH;
        idx += 1;
      }

      const totalsH = 36;
      if (y + totalsH > bottomLimit()) {
        doc.addPage();
        y = drawHeaderBlock(doc, {
          title: 'Tax Report',
          businessName: input.businessName,
          businessId: input.businessId,
          businessType: input.businessType,
          branchId: input.branchId,
          dateRange: input.dateRange,
          generatedAt: input.generatedAt,
          generatedBy: input.generatedBy,
        });
        drawHeader();
      }
      doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(3).strokeColor('#111827').stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(tableX, y, tableW, totalsH).fillColor('#e5e7eb').fill();
      doc.restore();
      doc.rect(tableX, y, tableW, totalsH).strokeColor('#d0d7de').lineWidth(1).stroke();
      drawDividers(y, totalsH, '#d0d7de');

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('TOTAL TAX', tableX + padX, y + 11, { width: colW.date + colW.sector - padX * 2, align: 'left', lineBreak: false });
      let cx = tableX + colW.date + colW.sector;
      doc.text(formatNumberTz(input.totals.net), cx + padX, y + 11, { width: colW.net - padX * 2, align: 'right' });
      cx += colW.net;
      doc.font('Helvetica-Bold').fontSize(11).text(formatNumberTz(input.totals.vat), cx + padX, y + 11, { width: colW.vat - padX * 2, align: 'right' });
      cx += colW.vat;
      doc.font('Helvetica-Bold').fontSize(11).text(formatNumberTz(input.totals.gross), cx + padX, y + 11, { width: colW.gross - padX * 2, align: 'right' });

      applyPageFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function renderExpensesPdf(input: {
  businessName: string;
  businessId: string;
  businessType: string;
  branchId: string;
  dateRange: { from?: Date; to?: Date };
  generatedAt: Date;
  generatedBy: string;
  rows: Array<{ date: Date; category: string; description: string; amount: number; paymentMode: string }>;
  total: number;
}): Promise<Buffer> {
  return await renderPnlPdf({
    businessName: input.businessName,
    businessId: input.businessId,
    businessType: input.businessType,
    branchId: input.branchId,
    dateRange: input.dateRange,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    sector: 'all',
    salesRows: [],
    expenseRows: input.rows,
    totals: { net: 0, vat: 0, gross: 0, expenses: input.total, netProfit: -input.total },
    mode: 'expensesOnly',
  });
}

async function renderPnlPdf(input: {
  businessName: string;
  businessId: string;
  businessType: string;
  branchId: string;
  dateRange: { from?: Date; to?: Date };
  generatedAt: Date;
  generatedBy: string;
  sector: string;
  salesRows: Array<{ date: Date; sector: string; net: number; vat: number; gross: number; paymentMode: string }>;
  expenseRows: Array<{ date: Date; category: string; description: string; amount: number; paymentMode: string }>;
  totals: { net: number; vat: number; gross: number; expenses: number; netProfit: number };
  mode?: 'pnl' | 'expensesOnly';
}): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      const title = input.mode === 'expensesOnly' ? 'Expense Report' : 'Profit & Loss';
      let y = drawHeaderBlock(doc, {
        title,
        businessName: input.businessName,
        businessId: input.businessId,
        businessType: input.businessType,
        branchId: input.branchId,
        dateRange: input.dateRange,
        generatedAt: input.generatedAt,
        generatedBy: input.generatedBy,
      });
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;
      const ensureSpace = (h: number) => {
        if (y + h > bottomLimit()) {
          doc.addPage();
          y = drawHeaderBlock(doc, {
            title,
            businessName: input.businessName,
            businessId: input.businessId,
            businessType: input.businessType,
            branchId: input.branchId,
            dateRange: input.dateRange,
            generatedAt: input.generatedAt,
            generatedBy: input.generatedBy,
          });
        }
      };

      const drawSectionTitle = (t2: string) => {
        ensureSpace(26);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(t2, x, y);
        y += 14;
        doc.moveTo(x, y).lineTo(x + pageWidth, y).lineWidth(1).strokeColor('#e5e7eb').stroke();
        doc.strokeColor('#000');
        y += 12;
      };

      if (input.mode !== 'expensesOnly') {
        // Sales table
        drawSectionTitle('Sales Transactions');
        const fixed = { date: 70, mode: 120 };
        const remaining = pageWidth - fixed.date - fixed.mode;
        const colW = { date: fixed.date, sector: 90, net: 80, vat: 70, gross: remaining - (90 + 80 + 70), mode: fixed.mode };
        const tableW = colW.date + colW.sector + colW.net + colW.vat + colW.gross + colW.mode;
        const tableX = x + (pageWidth - tableW) / 2;
        const padX = 6;
        const headerH = 28;
        const rowH = 24;

        const drawDividers = (topY: number, h: number, color: string) => {
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

        const drawHeader = () => {
          doc.save();
          doc.rect(tableX, y, tableW, headerH).fillColor('#f3f4f6').fill();
          doc.restore();
          doc.rect(tableX, y, tableW, headerH).strokeColor('#d0d7de').lineWidth(1).stroke();
          drawDividers(y, headerH, '#d0d7de');
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

        drawHeader();
        doc.font('Helvetica').fontSize(10).fillColor('#000');
        let idx = 0;
        for (const r of input.salesRows) {
          if (y + rowH > bottomLimit()) {
            doc.addPage();
            y = drawHeaderBlock(doc, {
              title,
              businessName: input.businessName,
              businessId: input.businessId,
              businessType: input.businessType,
              branchId: input.branchId,
              dateRange: input.dateRange,
              generatedAt: input.generatedAt,
              generatedBy: input.generatedBy,
            });
            drawHeader();
          }
          if (idx % 2 === 1) {
            doc.save();
            doc.rect(tableX, y, tableW, rowH).fillColor('#f8fafc').fill();
            doc.restore();
          }
          doc.rect(tableX, y, tableW, rowH).strokeColor('#e5e7eb').lineWidth(1).stroke();
          drawDividers(y, rowH, '#e5e7eb');
          let cx = tableX;
          drawCellText(doc, formatDdMmYyyy(r.date), cx + padX, y + 7, colW.date - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
          cx += colW.date;
          drawCellText(doc, String(r.sector), cx + padX, y + 7, colW.sector - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
          cx += colW.sector;
          drawCellText(doc, formatNumberTz(r.net), cx + padX, y + 7, colW.net - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
          cx += colW.net;
          drawCellText(doc, formatNumberTz(r.vat), cx + padX, y + 7, colW.vat - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
          cx += colW.vat;
          drawCellText(doc, formatNumberTz(r.gross), cx + padX, y + 7, colW.gross - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
          cx += colW.gross;
          drawCellText(doc, String(r.paymentMode || ''), cx + padX, y + 7, colW.mode - padX * 2, { align: 'center', baseSize: 10, minSize: 8, font: 'Helvetica' });
          y += rowH;
          idx += 1;
        }

        const totalsH = 36;
        if (y + totalsH > bottomLimit()) {
          doc.addPage();
          y = drawHeaderBlock(doc, {
            title,
            businessName: input.businessName,
            businessId: input.businessId,
            businessType: input.businessType,
            branchId: input.branchId,
            dateRange: input.dateRange,
            generatedAt: input.generatedAt,
            generatedBy: input.generatedBy,
          });
          drawHeader();
        }
        doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(3).strokeColor('#111827').stroke();
        doc.strokeColor('#000');
        doc.save();
        doc.rect(tableX, y, tableW, totalsH).fillColor('#e5e7eb').fill();
        doc.restore();
        doc.rect(tableX, y, tableW, totalsH).strokeColor('#d0d7de').lineWidth(1).stroke();
        drawDividers(y, totalsH, '#d0d7de');
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
        doc.text('TOTAL SALES', tableX + padX, y + 11, { width: colW.date + colW.sector - padX * 2, align: 'left', lineBreak: false });
        let cx = tableX + colW.date + colW.sector;
        doc.text(formatNumberTz(input.totals.net), cx + padX, y + 11, { width: colW.net - padX * 2, align: 'right' });
        cx += colW.net;
        doc.text(formatNumberTz(input.totals.vat), cx + padX, y + 11, { width: colW.vat - padX * 2, align: 'right' });
        cx += colW.vat;
        doc.text(formatNumberTz(input.totals.gross), cx + padX, y + 11, { width: colW.gross - padX * 2, align: 'right' });
        y += totalsH + 16;
      }

      // Expense table
      drawSectionTitle('Expense Transactions');
      const expFixed = { date: 70, category: 95, amount: 90, mode: 95 };
      const expDescW = pageWidth - expFixed.date - expFixed.category - expFixed.amount - expFixed.mode;
      const expColW = { date: expFixed.date, category: expFixed.category, description: Math.max(150, expDescW), amount: expFixed.amount, mode: expFixed.mode };
      const expW = expColW.date + expColW.category + expColW.description + expColW.amount + expColW.mode;
      const expX = x + (pageWidth - expW) / 2;
      const expPadX = 6;
      const expHeaderH = 28;
      const expRowH = 24;

      const drawExpDividers = (topY: number, h: number, color: string) => {
        doc.save();
        doc.strokeColor(color).lineWidth(1);
        let vx = expX + expColW.date;
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
        doc.rect(expX, y, expW, expHeaderH).fillColor('#f3f4f6').fill();
        doc.restore();
        doc.rect(expX, y, expW, expHeaderH).strokeColor('#d0d7de').lineWidth(1).stroke();
        drawExpDividers(y, expHeaderH, '#d0d7de');
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        let cx = expX;
        doc.text('Date', cx + expPadX, y + 9, { width: expColW.date - expPadX * 2, align: 'left' });
        cx += expColW.date;
        doc.text('Category', cx + expPadX, y + 9, { width: expColW.category - expPadX * 2, align: 'left' });
        cx += expColW.category;
        doc.text('Description', cx + expPadX, y + 9, { width: expColW.description - expPadX * 2, align: 'left' });
        cx += expColW.description;
        doc.text('Amount (TSh)', cx + expPadX, y + 9, { width: expColW.amount - expPadX * 2, align: 'right' });
        cx += expColW.amount;
        doc.text('Payment Mode', cx + expPadX, y + 9, { width: expColW.mode - expPadX * 2, align: 'center' });
        y += expHeaderH;
      };

      drawExpHeader();
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      let expIdx = 0;
      for (const r of input.expenseRows) {
        if (y + expRowH > bottomLimit()) {
          doc.addPage();
          y = drawHeaderBlock(doc, {
            title,
            businessName: input.businessName,
            businessId: input.businessId,
            businessType: input.businessType,
            branchId: input.branchId,
            dateRange: input.dateRange,
            generatedAt: input.generatedAt,
            generatedBy: input.generatedBy,
          });
          drawExpHeader();
        }
        if (expIdx % 2 === 1) {
          doc.save();
          doc.rect(expX, y, expW, expRowH).fillColor('#f8fafc').fill();
          doc.restore();
        }
        doc.rect(expX, y, expW, expRowH).strokeColor('#e5e7eb').lineWidth(1).stroke();
        drawExpDividers(y, expRowH, '#e5e7eb');
        let cx = expX;
        drawCellText(doc, formatDdMmYyyy(r.date), cx + expPadX, y + 7, expColW.date - expPadX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += expColW.date;
        drawCellText(doc, String(r.category), cx + expPadX, y + 7, expColW.category - expPadX * 2, { align: 'left', baseSize: 10, minSize: 8, font: 'Helvetica' });
        cx += expColW.category;
        drawCellText(doc, String(r.description || ''), cx + expPadX, y + 7, expColW.description - expPadX * 2, { align: 'left', baseSize: 10, minSize: 7, font: 'Helvetica' });
        cx += expColW.description;
        drawCellText(doc, formatNumberTz(r.amount), cx + expPadX, y + 7, expColW.amount - expPadX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += expColW.amount;
        drawCellText(doc, String(r.paymentMode || '-'), cx + expPadX, y + 7, expColW.mode - expPadX * 2, { align: 'center', baseSize: 10, minSize: 8, font: 'Helvetica' });
        y += expRowH;
        expIdx += 1;
      }

      const expTotalH = 36;
      if (y + expTotalH > bottomLimit()) {
        doc.addPage();
        y = drawHeaderBlock(doc, {
          title,
          businessName: input.businessName,
          businessId: input.businessId,
          businessType: input.businessType,
          branchId: input.branchId,
          dateRange: input.dateRange,
          generatedAt: input.generatedAt,
          generatedBy: input.generatedBy,
        });
        drawExpHeader();
      }
      doc.moveTo(expX, y).lineTo(expX + expW, y).lineWidth(3).strokeColor('#111827').stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(expX, y, expW, expTotalH).fillColor('#e5e7eb').fill();
      doc.restore();
      doc.rect(expX, y, expW, expTotalH).strokeColor('#d0d7de').lineWidth(1).stroke();
      drawExpDividers(y, expTotalH, '#d0d7de');
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('TOTAL EXPENSES', expX + expPadX, y + 11, { width: expColW.date + expColW.category + expColW.description - expPadX * 2, align: 'left', lineBreak: false });
      doc.text(formatNumberTz(input.totals.expenses), expX + expColW.date + expColW.category + expColW.description + expPadX, y + 11, { width: expColW.amount - expPadX * 2, align: 'right' });
      y += expTotalH + 18;

      // Summary
      if (input.mode !== 'expensesOnly') {
        drawSectionTitle('Summary');
        const boxPadding = 12;
        const boxX = x;
        const boxW = pageWidth;
        const boxTop = y;
        const boxH = 120;
        ensureSpace(boxH + 10);
        doc.save();
        doc.roundedRect(boxX, boxTop, boxW, boxH, 8).lineWidth(1).strokeColor('#d0d7de').fillColor('#fafafa').fillAndStroke();
        doc.restore();

        let sy = boxTop + boxPadding;
        const labelX = boxX + boxPadding;
        const lineGap = 16;
        const kv = (label: string, value: string, bold = false) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor('#111827').text(label, labelX, sy);
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica-Bold').fontSize(bold ? 12 : 10).fillColor('#111827').text(value, labelX, sy, { width: boxW - boxPadding * 2, align: 'right' });
          sy += lineGap;
        };
        kv('Total Net Revenue (TSh)', formatNumberTz(input.totals.net));
        kv('Total VAT (TSh)', formatNumberTz(input.totals.vat));
        kv('Total Gross Revenue (TSh)', formatNumberTz(input.totals.gross));
        kv('Total Expenses (TSh)', formatNumberTz(input.totals.expenses));
        kv('Net Profit (Net Revenue - Expenses) (TSh)', formatNumberTz(input.totals.netProfit), true);
      }

      applyPageFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

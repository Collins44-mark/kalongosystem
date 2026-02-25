import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import { addHmsReportHeader, applyHeaderRowStyle, autoSizeColumns, BORDER_THIN, CURRENCY_FMT } from '../common/excel-utils';
import {
  applyHmsPageFooter,
  drawHmsReportHeader,
  formatMoney as pdfFormatMoney,
  PDF_MARGIN,
  TABLE_BORDER,
  TABLE_BORDER_LIGHT,
  TABLE_HEADER_BG,
  TABLE_ROW_STRIPE,
  toTitleCase,
} from '../common/pdf-utils';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { BarService } from '../bar/bar.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { WorkersService } from '../workers/workers.service';
import { readFile } from 'fs/promises';
import { join as joinPath } from 'path';

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
      select: { name: true, businessId: true, businessType: true, logoUrl: true },
    });
    const businessName = business?.name || 'Business';
    const businessDisplayId = business?.businessId || businessId;
    const businessType = business?.businessType || '-';

    const logoBuffer = await this.getBusinessLogoBuffer(businessId, business?.logoUrl ?? null);

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
        const branchExport = formatBranchIdLabel(branchId);
        const header = 'Branch ID,Date,Transaction Type,Reference,Sector,Customer Name,Payment Method,Net Amount,VAT Amount,Gross Amount,Currency';
        const rows = [...txns]
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map((t: any) => {
            const date = formatIsoDate(new Date(t.date));
            const sector = normalizeSector(t.sector);
            const reference = String(t.referenceId ?? '').trim() || 'UNKNOWN';
            const customerName = defaultCustomerNameForSector(sector, t.customerName);
            if (sector === 'ROOMS' && !String(t.customerName ?? '').trim()) {
              throw new BadRequestException(`Missing guest name for ROOMS sale ${reference}`);
            }
            const paymentMethod = normalizePaymentMethodCsv(t.paymentMode);
            const paymentMethodLabel = formatPaymentMethodLabel(paymentMethod);
            const netC = cents2(t.netAmount);
            const vatC = cents2(t.vatAmount);
            const grossC = cents2(t.grossAmount);
            if (netC + vatC !== grossC) {
              throw new BadRequestException(`Invalid sale export amounts for ${reference}: Net+VAT must equal Gross`);
            }
            return [
              branchExport,
              date,
              'Sale',
              reference,
              sector,
              customerName,
              paymentMethodLabel,
              money2Csv(t.netAmount),
              money2Csv(t.vatAmount),
              money2Csv(t.grossAmount),
              'TZS',
            ].map(csvEscape).join(',');
          });
        const csv = [header, ...rows].join('\n') + '\n';
        return {
          filename: `sales-report-${exportDate}.csv`,
          contentType: 'text/csv; charset=utf-8',
          body: Buffer.from(csv, 'utf8'),
        };
      }

      if (fmt === 'xlsx') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const exportDate = formatIsoDate(new Date());
        const rangeFromLabel = from ? formatIsoDate(from) : 'ALL';
        const rangeToLabel = to ? formatIsoDate(to) : 'ALL';
        const periodLabel = `${rangeFromLabel} to ${rangeToLabel}`;

        // =========================
        // Sheet 1: Sales_Data
        // =========================
        const wsData = wb.addWorksheet('Sales_Data');
        const headerEndRow = addHmsReportHeader(wsData, {
          title: 'Sales Report',
          businessName,
          period: periodLabel,
        });
        wsData.getRow(headerEndRow).height = 8;

        const dataHeaders = [
          'Date',
          'Transaction Type',
          'Sector',
          'Customer Name',
          'Net Amount',
          'VAT Amount',
          'Gross Amount',
          'Payment Method',
          'Reference',
        ];
        const tableStartRow = headerEndRow + 1;
        wsData.views = [{ state: 'frozen', ySplit: tableStartRow - 1 }];

        const ordered = [...txns].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const dataRows: any[][] = ordered.map((t: any) => {
          const sector = normalizeSector(t.sector);
          const reference = String(t.referenceId ?? '').trim() || 'UNKNOWN';
          const customerName = defaultCustomerNameForSector(sector, t.customerName);
          const paymentMethod = normalizePaymentMethodExport(t.paymentMode);
          const net = Number(t.netAmount ?? 0);
          const vat = Number(t.vatAmount ?? 0);
          const gross = Number(t.grossAmount ?? 0);

          const netC = cents2(net);
          const vatC = cents2(vat);
          const grossC = cents2(gross);
          if (netC + vatC !== grossC) {
            throw new BadRequestException(`Invalid sale export amounts for ${reference}: Net+VAT must equal Gross`);
          }

          // Date exported as ISO text (YYYY-MM-DD)
          return [
            formatIsoDate(new Date(t.date)),
            'Sale',
            sector,
            customerName,
            net,
            vat,
            gross,
            paymentMethod,
            reference,
          ];
        });

        const tableRef = `A${tableStartRow}`;
        wsData.addTable({
          name: 'SalesData',
          ref: tableRef,
          headerRow: true,
          totalsRow: false,
          style: { theme: 'TableStyleLight9', showRowStripes: true },
          columns: dataHeaders.map((h) => ({ name: h, filterButton: true })),
          rows: dataRows,
        });

        const hdrRow = wsData.getRow(tableStartRow);
        applyHeaderRowStyle(hdrRow, dataHeaders.length);

        for (const colIdx of [5, 6, 7]) {
          const col = wsData.getColumn(colIdx);
          col.numFmt = CURRENCY_FMT;
          col.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        for (const colIdx of [1, 2, 3, 4, 8, 9]) {
          wsData.getColumn(colIdx).alignment = { horizontal: 'left', vertical: 'middle' };
        }

        const lastRow = tableStartRow + dataRows.length;
        const lastCol = dataHeaders.length;
        for (let r = tableStartRow; r <= lastRow; r++) {
          const row = wsData.getRow(r);
          for (let c = 1; c <= lastCol; c++) {
            row.getCell(c).border = BORDER_THIN;
          }
        }

        autoSizeColumns(wsData);

        // Page setup: fit to 1 page width, centered, correct print area (no extra blank pages)
        wsData.pageSetup = {
          ...wsData.pageSetup,
          horizontalCentered: true,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printArea: `A1:I${lastRow}`,
        };

        // =========================
        // Sheet 2: Summary
        // =========================
        const wsSum = wb.addWorksheet('Summary');
        addHmsReportHeader(wsSum, { title: 'Sales Report', businessName, period: periodLabel });
        wsSum.getRow(5).height = 8;

        wsSum.getColumn(1).width = 4;
        wsSum.getColumn(2).width = 28;
        wsSum.getColumn(3).width = 22;
        wsSum.getColumn(4).width = 4;

        const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };

        wsSum.getCell('B7').value = 'Total Net Revenue';
        wsSum.getCell('C7').value = { formula: 'SUM(Sales_Data!E:E)' };
        wsSum.getCell('B8').value = 'Total VAT';
        wsSum.getCell('C8').value = { formula: 'SUM(Sales_Data!F:F)' };
        wsSum.getCell('B9').value = 'Total Gross Revenue';
        wsSum.getCell('C9').value = { formula: 'SUM(Sales_Data!G:G)' };

        wsSum.getRow(10).height = 8;
        wsSum.getCell('B11').value = 'Revenue by Sector';
        wsSum.getCell('B11').font = { bold: true };
        wsSum.getCell('B12').value = 'Rooms';
        wsSum.getCell('C12').value = { formula: 'SUMIF(Sales_Data!C:C,"ROOMS",Sales_Data!G:G)' };
        wsSum.getCell('B13').value = 'Bar';
        wsSum.getCell('C13').value = { formula: 'SUMIF(Sales_Data!C:C,"BAR",Sales_Data!G:G)' };
        wsSum.getCell('B14').value = 'Restaurant';
        wsSum.getCell('C14').value = { formula: 'SUMIF(Sales_Data!C:C,"RESTAURANT",Sales_Data!G:G)' };
        wsSum.getCell('B15').value = 'Other';
        wsSum.getCell('C15').value = { formula: 'SUMIF(Sales_Data!C:C,"OTHER",Sales_Data!G:G)' };

        wsSum.getRow(16).height = 8;
        wsSum.getCell('B17').value = 'Revenue by Payment Method';
        wsSum.getCell('B17').font = { bold: true };
        wsSum.getCell('B18').value = 'Cash';
        wsSum.getCell('C18').value = { formula: 'SUMIF(Sales_Data!H:H,"CASH",Sales_Data!G:G)' };
        wsSum.getCell('B19').value = 'Bank';
        wsSum.getCell('C19').value = { formula: 'SUMIF(Sales_Data!H:H,"BANK",Sales_Data!G:G)' };
        wsSum.getCell('B20').value = 'Mobile Money';
        wsSum.getCell('C20').value = { formula: 'SUMIF(Sales_Data!H:H,"MOBILE_MONEY",Sales_Data!G:G)' };
        wsSum.getCell('B21').value = 'Card';
        wsSum.getCell('C21').value = { formula: 'SUMIF(Sales_Data!H:H,"CARD",Sales_Data!G:G)' };

        for (const r of [7, 8, 9, 12, 13, 14, 15, 18, 19, 20, 21]) {
          const c = wsSum.getCell(`C${r}`);
          c.numFmt = CURRENCY_FMT;
          c.font = { bold: true };
          c.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        for (const r of [7, 8, 9, 12, 13, 14, 15, 18, 19, 20, 21]) {
          wsSum.getCell(`B${r}`).alignment = { horizontal: 'left', vertical: 'middle' };
        }

        const applyBox = (top: number, bottom: number) => {
          for (let r = top; r <= bottom; r++) {
            for (let c = 2; c <= 3; c++) {
              const cell = wsSum.getRow(r).getCell(c);
              cell.border = BORDER_THIN;
              if (r > top) cell.fill = fill;
            }
          }
        };
        applyBox(7, 9);
        applyBox(11, 15);
        applyBox(17, 21);

        wsSum.pageSetup = {
          ...wsSum.pageSetup,
          horizontalCentered: true,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printArea: 'A1:D24',
        };

        const buf: any = await wb.xlsx.writeBuffer();
        return {
          filename: `sales-report-${exportDate}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
        };
      }

      const pdf = await renderSalesPdf({
        logoBuffer,
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
        const rangeFromLabel = from ? formatIsoDate(from) : 'ALL';
        const rangeToLabel = to ? formatIsoDate(to) : 'ALL';
        const periodLabel = `${rangeFromLabel} to ${rangeToLabel}`;

        const ws = wb.addWorksheet('Tax');
        const headerEndRow = addHmsReportHeader(ws, { title: 'Tax Report', businessName, period: periodLabel });
        ws.getRow(headerEndRow).height = 8;
        const tableStartRow = headerEndRow + 1;
        ws.views = [{ state: 'frozen', ySplit: tableStartRow - 1 }];

        const headers = ['Date', 'Sector', 'Net Amount', 'VAT Amount', 'Gross Amount'];
        const dataRows = txns.map((t: any) => [
          formatDdMmYyyy(t.date),
          t.sector,
          round0(t.netAmount),
          round0(t.vatAmount),
          round0(t.grossAmount),
        ]);
        dataRows.push(['', 'TOTAL TAX', round0(totalNet), round0(totalVat), round0(totalGross)]);

        ws.addTable({
          name: 'TaxData',
          ref: `A${tableStartRow}`,
          headerRow: true,
          totalsRow: false,
          style: { theme: 'TableStyleLight9', showRowStripes: true },
          columns: headers.map((h) => ({ name: h, filterButton: true })),
          rows: dataRows,
        });

        applyHeaderRowStyle(ws.getRow(tableStartRow), headers.length);
        for (const colIdx of [3, 4, 5]) {
          ws.getColumn(colIdx).numFmt = CURRENCY_FMT;
          ws.getColumn(colIdx).alignment = { horizontal: 'right', vertical: 'middle' };
        }
        for (const colIdx of [1, 2]) {
          ws.getColumn(colIdx).alignment = { horizontal: 'left', vertical: 'middle' };
        }
        const lastRow = tableStartRow + dataRows.length;
        for (let r = tableStartRow; r <= lastRow; r++) {
          const row = ws.getRow(r);
          for (let c = 1; c <= 5; c++) row.getCell(c).border = BORDER_THIN;
        }
        autoSizeColumns(ws);

        const buf: any = await wb.xlsx.writeBuffer();
        return {
          filename: `${baseName}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
        };
      }

      const pdf = await renderTaxPdf({
        logoBuffer,
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
        const rangeFromLabel = from ? formatIsoDate(from) : 'ALL';
        const rangeToLabel = to ? formatIsoDate(to) : 'ALL';
        const periodLabel = `${rangeFromLabel} to ${rangeToLabel}`;

        const ws = wb.addWorksheet('Expenses');
        const headerEndRow = addHmsReportHeader(ws, { title: 'Expenses Report', businessName, period: periodLabel });
        ws.getRow(headerEndRow).height = 8;
        const tableStartRow = headerEndRow + 1;
        ws.views = [{ state: 'frozen', ySplit: tableStartRow - 1 }];

        const headers = ['Date', 'Category', 'Description', 'Amount', 'Payment Mode'];
        const sortedRows = [...rows].filter((r) => Boolean(r.date)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const dataRows = sortedRows.map((r) => [r.date, r.category, r.description, round0(r.amount), '-']);
        dataRows.push(['', '', 'TOTAL EXPENSES', round0(total), '']);

        ws.addTable({
          name: 'ExpensesData',
          ref: `A${tableStartRow}`,
          headerRow: true,
          totalsRow: false,
          style: { theme: 'TableStyleLight9', showRowStripes: true },
          columns: headers.map((h) => ({ name: h, filterButton: true })),
          rows: dataRows,
        });

        applyHeaderRowStyle(ws.getRow(tableStartRow), headers.length);
        ws.getColumn(4).numFmt = CURRENCY_FMT;
        ws.getColumn(4).alignment = { horizontal: 'right', vertical: 'middle' };
        for (const colIdx of [1, 2, 3, 5]) {
          ws.getColumn(colIdx).alignment = { horizontal: 'left', vertical: 'middle' };
        }
        const lastRow = tableStartRow + dataRows.length;
        for (let r = tableStartRow; r <= lastRow; r++) {
          const row = ws.getRow(r);
          for (let c = 1; c <= 5; c++) row.getCell(c).border = BORDER_THIN;
        }
        autoSizeColumns(ws);

        const buf: any = await wb.xlsx.writeBuffer();
        return {
          filename: `${baseName}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
        };
      }

      const pdf = await renderExpensesPdf({
        logoBuffer,
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
      const rangeFromLabel = from ? formatIsoDate(from) : 'ALL';
      const rangeToLabel = to ? formatIsoDate(to) : 'ALL';
      const periodLabel = `${rangeFromLabel} to ${rangeToLabel}`;

      const wsSum = wb.addWorksheet('Summary');
      addHmsReportHeader(wsSum, { title: 'P&L Report', businessName, period: periodLabel });
      wsSum.getRow(5).height = 8;
      wsSum.getColumn(2).width = 22;
      wsSum.getColumn(3).width = 18;

      wsSum.getCell('B7').value = 'Total Revenue (Gross)';
      wsSum.getCell('C7').value = round0(totalGross);
      wsSum.getCell('B8').value = 'Total Expenses';
      wsSum.getCell('C8').value = round0(totalExpenses);
      wsSum.getCell('B9').value = 'Net Profit';
      wsSum.getCell('C9').value = round0(netProfit);
      const marginPct = totalGross > 0 ? (netProfit / totalGross) * 100 : 0;
      wsSum.getCell('B10').value = 'Profit Margin (%)';
      wsSum.getCell('C10').value = `${marginPct.toFixed(1)}%`;

      for (const r of [7, 8, 9]) {
        wsSum.getCell(`C${r}`).numFmt = CURRENCY_FMT;
        wsSum.getCell(`C${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
      }
      wsSum.getCell('C9').font = { bold: true, color: { argb: netProfit >= 0 ? 'FF059669' : 'FFDC2626' } };
      wsSum.getCell('C10').alignment = { horizontal: 'right', vertical: 'middle' };

      const wsSales = wb.addWorksheet('Sales');
      const salesHeaderEnd = addHmsReportHeader(wsSales, { title: 'P&L Report', businessName, period: periodLabel });
      wsSales.getRow(salesHeaderEnd).height = 8;
      const salesTableStart = salesHeaderEnd + 1;
      wsSales.views = [{ state: 'frozen', ySplit: salesHeaderEnd }];
      const salesHeaders = ['Date', 'Sector', 'Net Amount', 'Gross Amount', 'Payment Mode'];
      const salesDataRows = txns.map((t: any) => [
        formatDdMmYyyy(t.date),
        t.sector,
        round0(t.netAmount),
        round0(t.grossAmount),
        t.paymentMode,
      ]);
      salesDataRows.push(['', 'TOTAL SALES', round0(totalNet), round0(totalGross), '']);
      wsSales.addTable({
        name: 'PnlSalesData',
        ref: `A${salesTableStart}`,
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleLight9', showRowStripes: true },
        columns: salesHeaders.map((h) => ({ name: h, filterButton: true })),
        rows: salesDataRows,
      });
      applyHeaderRowStyle(wsSales.getRow(salesTableStart), salesHeaders.length);
      for (const colIdx of [3, 4]) {
        wsSales.getColumn(colIdx).numFmt = CURRENCY_FMT;
        wsSales.getColumn(colIdx).alignment = { horizontal: 'right', vertical: 'middle' };
        wsSales.getColumn(colIdx).width = 16;
      }
      for (const colIdx of [1, 2, 5]) wsSales.getColumn(colIdx).alignment = { horizontal: 'left', vertical: 'middle' };
      for (let r = salesTableStart; r <= salesTableStart + salesDataRows.length; r++) {
        const row = wsSales.getRow(r);
        for (let c = 1; c <= 5; c++) row.getCell(c).border = BORDER_THIN;
      }
      autoSizeColumns(wsSales);

      const wsExp = wb.addWorksheet('Expenses');
      const expHeaderEnd = addHmsReportHeader(wsExp, { title: 'P&L Report', businessName, period: periodLabel });
      wsExp.getRow(expHeaderEnd).height = 8;
      const expTableStart = expHeaderEnd + 1;
      wsExp.views = [{ state: 'frozen', ySplit: expHeaderEnd }];
      const expHeaders = ['Date', 'Category', 'Description', 'Amount', 'Payment Mode'];
      const expDataRows = expRows.map((r: any) => [
        formatDdMmYyyy(r.date),
        r.category,
        r.description,
        round0(r.amount),
        '-',
      ]);
      expDataRows.push(['', '', 'TOTAL EXPENSES', round0(totalExpenses), '']);
      wsExp.addTable({
        name: 'PnlExpensesData',
        ref: `A${expTableStart}`,
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleLight9', showRowStripes: true },
        columns: expHeaders.map((h) => ({ name: h, filterButton: true })),
        rows: expDataRows,
      });
      applyHeaderRowStyle(wsExp.getRow(expTableStart), expHeaders.length);
      wsExp.getColumn(4).numFmt = CURRENCY_FMT;
      wsExp.getColumn(4).alignment = { horizontal: 'right', vertical: 'middle' };
      for (const colIdx of [1, 2, 3, 5]) wsExp.getColumn(colIdx).alignment = { horizontal: 'left', vertical: 'middle' };
      for (let r = expTableStart; r <= expTableStart + expDataRows.length; r++) {
        const row = wsExp.getRow(r);
        for (let c = 1; c <= 5; c++) row.getCell(c).border = BORDER_THIN;
      }
      autoSizeColumns(wsExp);

      const buf: any = await wb.xlsx.writeBuffer();
      return {
        filename: `${baseName}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
      };
    }

    const pdf = await renderPnlPdf({
      logoBuffer,
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

  private async getBusinessLogoBuffer(businessId: string, logoUrl: string | null): Promise<Buffer | null> {
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

    // Fallback to http/https
    try {
      const { request } = require(url.toLowerCase().startsWith('https://') ? 'node:https' : 'node:http');
      return await new Promise((resolve) => {
        const req = request(url, (resp: any) => {
          if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers?.location) {
            // no redirect follow (keep simple)
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
  return pdfFormatMoney(n);
}

function formatIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function numberCsv0(n: any) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  return String(Math.round(v));
}

function money2Csv(n: any) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) throw new BadRequestException('Invalid money amount');
  return (Math.round(v * 100) / 100).toFixed(2);
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

function normalizeBranchIdExport(branchId: any) {
  const b = String(branchId ?? '').trim();
  if (!b) return 'MAIN';
  if (b.toLowerCase() === 'main') return 'MAIN';
  return b.toUpperCase();
}

function formatBranchIdLabel(branchId: any) {
  const v = normalizeBranchIdExport(branchId);
  return v === 'MAIN' ? 'Main' : v;
}

function normalizePaymentMethodCsv(input: any): 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'CARD' {
  const raw = String(input ?? '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

  if (!raw) return 'CASH';
  if (raw === 'PAID DIRECT' || raw.includes('PAID DIRECT') || raw === 'DIRECT') return 'CASH';
  if (raw === '-' || raw === 'N/A' || raw === 'NA') return 'CASH';
  if (raw.includes('CASH')) return 'CASH';
  if (raw.includes('CARD') || raw.includes('VISA') || raw.includes('MASTERCARD')) return 'CARD';
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

function formatPaymentMethodLabel(m: 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'CARD') {
  if (m === 'CASH') return 'Cash';
  if (m === 'BANK') return 'Bank';
  if (m === 'MOBILE_MONEY') return 'Mobile Money';
  return 'Card';
}

function normalizePaymentMethodExport(input: any): 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'CARD' {
  const raw = String(input ?? '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

  if (!raw) return 'CASH';
  if (raw === 'PAID DIRECT' || raw.includes('PAID DIRECT') || raw === 'DIRECT') return 'CASH';
  if (raw === '-' || raw === 'N/A' || raw === 'NA') return 'CASH';
  if (raw.includes('CASH')) return 'CASH';
  if (raw.includes('CARD') || raw.includes('VISA') || raw.includes('MASTERCARD')) return 'CARD';
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
  applyHmsPageFooter(doc);
}

function drawPnlFirstPage(
  doc: any,
  input: {
    title: string;
    logoBuffer: Buffer | null;
    businessName: string;
    businessId: string;
    businessType: string;
    branchId: string;
    dateRange: { from?: Date; to?: Date };
    generatedAt: Date;
    generatedBy: string;
    totals: { net: number; vat: number; gross: number; expenses: number; netProfit: number };
    mode?: 'pnl' | 'expensesOnly';
  },
): number {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;

  let y = drawHmsReportHeader(doc, {
    title: input.title,
    subtitle: 'Hospitality Management System',
    businessName: input.businessName,
    branchId: input.branchId,
    dateRange: input.dateRange,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
  });

  const pad = 14;
  const summaryTop = y;

  if (input.mode === 'expensesOnly') {
    const summaryH = 50;
    doc.save();
    doc.roundedRect(x, summaryTop, pageWidth, summaryH, 6).fillColor('#f9fafb').fill();
    doc.roundedRect(x, summaryTop, pageWidth, summaryH, 6).lineWidth(0.5).strokeColor(TABLE_BORDER).stroke();
    doc.restore();
    let sy = summaryTop + pad;
    doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total Expenses (TSh)', x + pad, sy, { width: pageWidth - pad * 2 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(formatNumberTz(input.totals.expenses), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
    return summaryTop + summaryH + 24;
  }

  const summaryH = 180;
  doc.save();
  doc.roundedRect(x, summaryTop, pageWidth, summaryH, 6).fillColor('#f9fafb').fill();
  doc.roundedRect(x, summaryTop, pageWidth, summaryH, 6).lineWidth(0.5).strokeColor(TABLE_BORDER).stroke();
  doc.restore();

  let sy = summaryTop + pad;
  const lineH = 20;
  const itemGap = 4;

  doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total Gross Revenue', x + pad, sy, { width: pageWidth - pad * 2 });
  doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatNumberTz(input.totals.gross), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
  sy += lineH + itemGap;

  doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total VAT', x + pad, sy, { width: pageWidth - pad * 2 });
  doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatNumberTz(input.totals.vat), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
  sy += lineH + itemGap;

  doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Net Revenue', x + pad, sy, { width: pageWidth - pad * 2 });
  doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatNumberTz(input.totals.net), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
  sy += lineH + itemGap;

  doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total Expenses', x + pad, sy, { width: pageWidth - pad * 2 });
  doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatNumberTz(input.totals.expenses), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
  sy += lineH + itemGap + 8;

  const profitColor = input.totals.netProfit >= 0 ? '#059669' : '#DC2626';
  doc.font('Helvetica-Bold').fontSize(14).fillColor(profitColor).text('Net Profit', x + pad, sy, { width: pageWidth - pad * 2 });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(profitColor).text(formatNumberTz(input.totals.netProfit), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
  sy += lineH + itemGap;

  const marginPct = input.totals.gross > 0 ? (input.totals.netProfit / input.totals.gross) * 100 : 0;
  doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Profit Margin (%)', x + pad, sy, { width: pageWidth - pad * 2 });
  doc.font('Helvetica').fontSize(10).fillColor('#000').text(`${marginPct.toFixed(1)}%`, x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });

  return summaryTop + summaryH + 24;
}

function drawPnlContinuationTop(doc: any): number {
  return doc.page.margins.top + 8;
}

function drawHeaderBlock(doc: any, input: {
  title: string;
  logoBuffer?: Buffer | null;
  showLogo?: boolean;
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
  const headerH = 96;
  const gap = 14;
  const leftW = 150;
  const rightW = 190;
  const centerW = pageWidth - leftW - rightW - gap * 2;
  const leftX = x;
  const centerX = x + leftW + gap;
  const rightX = centerX + centerW + gap;

  // Left column: logo (reserve space even when absent)
  const logoMaxW = 120;
  const logoMaxH = 80;
  const logoBoxX = leftX + Math.max(0, (leftW - logoMaxW) / 2);
  const logoBoxY = top + Math.max(0, (headerH - logoMaxH) / 2);
  const canDrawLogo =
    input.showLogo !== false &&
    input.logoBuffer &&
    Buffer.isBuffer(input.logoBuffer) &&
    input.logoBuffer.length > 0;
  if (canDrawLogo) {
    try {
      doc.image(input.logoBuffer, logoBoxX, logoBoxY, { fit: [logoMaxW, logoMaxH], align: 'center', valign: 'center' });
    } catch {
      // ignore broken logo buffers
    }
  }

  // Center column: report meta
  doc.fillColor('#111827');
  doc.font('Helvetica-Bold').fontSize(14).text(String(input.title || 'Report'), centerX, top + 6, { width: centerW, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  const f = input.dateRange.from ? input.dateRange.from.toISOString().slice(0, 10) : '-';
  const t = input.dateRange.to ? input.dateRange.to.toISOString().slice(0, 10) : '-';
  const metaLines = [
    `Business ID: ${String(input.businessId || '-')}`,
    `Branch ID: ${String(input.branchId || '-')}`,
    `Business Type: ${String(input.businessType || '-')}`,
    `Date Range: ${f} to ${t}`,
  ];
  let metaY = top + 28;
  for (const line of metaLines) {
    doc.text(line, centerX, metaY, { width: centerW, align: 'center', lineBreak: false });
    metaY += 12;
  }

  // Right column: generated info
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  doc.text('Generated On', rightX, top + 18, { width: rightW, align: 'right', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
  doc.text(formatDateTime(input.generatedAt), rightX, top + 30, { width: rightW, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  doc.text('Generated By', rightX, top + 50, { width: rightW, align: 'right', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
  doc.text(String(input.generatedBy || 'User'), rightX, top + 62, { width: rightW, align: 'right', lineBreak: false });

  // Divider
  const dividerY = top + headerH + 10;
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

async function renderSalesPdf(input: {
  logoBuffer: Buffer | null;
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
      const doc = new PDFDocument({ margin: PDF_MARGIN, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      const formatMoney = pdfFormatMoney;

      const drawSalesFirstHeader = () =>
        drawHmsReportHeader(doc, {
          title: 'Sales Report',
          subtitle: 'Hospitality Management System',
          businessName: input.businessName,
          branchId: input.branchId,
          dateRange: input.dateRange,
          generatedAt: input.generatedAt,
          generatedBy: input.generatedBy,
        });

      const normalizePaymentLabel = (s: any) => {
        const pm = String(s || '').toUpperCase();
        if (pm.includes('CARD') || pm.includes('VISA') || pm.includes('MASTERCARD')) return 'Card';
        if (pm.includes('BANK') || pm.includes('TRANSFER') || pm.includes('EFT')) return 'Bank';
        if (pm.includes('MOBILE') || pm.includes('MPESA') || pm.includes('TIGO') || pm.includes('AIRTEL') || pm.includes('HALOPESA')) return 'Mobile Money';
        return 'Cash';
      };

      let y = drawSalesFirstHeader();

      // Sales Summary box at top
      const summaryBoxH = 58;
      doc.save();
      doc.roundedRect(x, y, pageWidth, summaryBoxH, 6).fillColor('#f9fafb').fill();
      doc.roundedRect(x, y, pageWidth, summaryBoxH, 6).lineWidth(0.5).strokeColor(TABLE_BORDER).stroke();
      doc.restore();
      const pad = 12;
      let sy = y + pad;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total Net Revenue', x + pad, sy, { width: pageWidth - pad * 2 });
      doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatMoney(input.totals.net), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
      sy += 14;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total VAT', x + pad, sy, { width: pageWidth - pad * 2 });
      doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatMoney(input.totals.vat), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
      sy += 14;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total Gross Revenue', x + pad, sy, { width: pageWidth - pad * 2 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(formatMoney(input.totals.gross), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
      y = y + summaryBoxH + 16;

      // Payment breakdown (by gross)
      const paymentSummary = {
        CASH: 0,
        BANK: 0,
        MOBILE_MONEY: 0,
        CARD: 0,
      } as Record<string, number>;
      for (const r of input.rows) {
        const pm = String(r.paymentMode || '').toUpperCase();
        const k =
          pm.includes('CARD') || pm.includes('VISA') || pm.includes('MASTERCARD')
            ? 'CARD'
            : pm.includes('BANK') || pm.includes('TRANSFER') || pm.includes('EFT')
              ? 'BANK'
              : pm.includes('MOBILE') || pm.includes('MPESA') || pm.includes('TIGO') || pm.includes('AIRTEL') || pm.includes('HALOPESA')
                ? 'MOBILE_MONEY'
                : 'CASH';
        paymentSummary[k] = (paymentSummary[k] ?? 0) + Number(r.gross || 0);
      }

      // Table: fit exactly within page width
      const base = { date: 72, sector: 120, net: 80, vat: 80, gross: 90 };
      let modeW = pageWidth - (base.date + base.sector + base.net + base.vat + base.gross);
      let sectorW = base.sector;
      if (modeW < 64) {
        const need = 64 - modeW;
        sectorW = Math.max(90, sectorW - need);
        modeW = pageWidth - (base.date + sectorW + base.net + base.vat + base.gross);
      }
      const colW = { date: base.date, sector: sectorW, net: base.net, vat: base.vat, gross: base.gross, mode: modeW };
      const tableW = colW.date + colW.sector + colW.net + colW.vat + colW.gross + colW.mode;
      const tableX = x + (pageWidth - tableW) / 2;
      const padX = 6;
      const headerH = 30;
      const rowH = 24;
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 22;

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
        doc.rect(tableX, y, tableW, headerH).fillColor(TABLE_HEADER_BG).fill();
        doc.restore();
        doc.rect(tableX, y, tableW, headerH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(1).stroke();
        drawDividers(y, headerH, TABLE_BORDER_LIGHT);
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
        doc.text('Payment Method', cx + padX, y + 9, { width: colW.mode - padX * 2, align: 'left' });
        y += headerH;
      };

      drawHeader();
      doc.font('Helvetica').fontSize(10).fillColor('#000');

      let idx = 0;
      for (const r of input.rows) {
        if (y + rowH > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: PDF_MARGIN });
          y = doc.page.margins.top + 8;
        }
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(tableX, y, tableW, rowH).fillColor(TABLE_ROW_STRIPE).fill();
          doc.restore();
        }
        doc.rect(tableX, y, tableW, rowH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(0.5).stroke();
        drawDividers(y, rowH, TABLE_BORDER_LIGHT);
        let cx = tableX;
        drawCellText(doc, formatIsoDate(r.date), cx + padX, y + 7, colW.date - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.date;
        drawCellText(doc, toTitleCase(String(r.sector)), cx + padX, y + 7, colW.sector - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.sector;
        drawCellText(doc, formatMoney(r.net), cx + padX, y + 7, colW.net - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.net;
        drawCellText(doc, formatMoney(r.vat), cx + padX, y + 7, colW.vat - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.vat;
        drawCellText(doc, formatMoney(r.gross), cx + padX, y + 7, colW.gross - padX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.gross;
        drawCellText(doc, normalizePaymentLabel(r.paymentMode), cx + padX, y + 7, colW.mode - padX * 2, { align: 'left', baseSize: 10, minSize: 8, font: 'Helvetica' });
        y += rowH;
        idx += 1;
      }

      const totalsH = 36;
      if (y + totalsH > bottomLimit()) {
        doc.addPage({ size: 'A4', margin: PDF_MARGIN });
        y = doc.page.margins.top + 8;
      }
      doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(1.5).strokeColor(TABLE_BORDER).stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(tableX, y, tableW, totalsH).fillColor(TABLE_HEADER_BG).fill();
      doc.restore();
      doc.rect(tableX, y, tableW, totalsH).strokeColor(TABLE_BORDER).lineWidth(1).stroke();
      drawDividers(y, totalsH, TABLE_BORDER_LIGHT);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('TOTAL SALES', tableX + padX, y + 11, { width: colW.date + colW.sector - padX * 2, align: 'left', lineBreak: false });
      let cx = tableX + colW.date + colW.sector;
      drawCellText(doc, formatMoney(input.totals.net), cx + padX, y + 11, colW.net - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });
      cx += colW.net;
      drawCellText(doc, formatMoney(input.totals.vat), cx + padX, y + 11, colW.vat - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });
      cx += colW.vat;
      drawCellText(doc, formatMoney(input.totals.gross), cx + padX, y + 11, colW.gross - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });

      y += totalsH + 12;

      // Payment Summary (centered, bordered box)
      const paymentRowsAll: Array<{ key: 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'CARD'; label: string; amount: number }> = [
        { key: 'CASH', label: 'Cash Total:', amount: paymentSummary.CASH },
        { key: 'BANK', label: 'Bank Total:', amount: paymentSummary.BANK },
        { key: 'MOBILE_MONEY', label: 'Mobile Money Total:', amount: paymentSummary.MOBILE_MONEY },
        { key: 'CARD', label: 'Card Total:', amount: paymentSummary.CARD },
      ];
      const paymentRows = paymentRowsAll.filter((r) => cents2(r.amount) !== 0);
      const totalReceived = paymentRows.reduce((s, r) => s + r.amount, 0);
      const payBoxH = Math.max(58, 22 + paymentRows.length * 18) + 20;
      const sigH = 64;
      if (y + payBoxH + sigH > bottomLimit()) {
        doc.addPage({ size: 'A4', margin: PDF_MARGIN });
        y = doc.page.margins.top + 8;
      }

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Payment Summary', x, y, { width: pageWidth, align: 'center' });
      y += 12;
      const boxW = Math.min(320, pageWidth);
      const boxX = x + (pageWidth - boxW) / 2;
      const boxY = y;
      doc.save();
      doc.rect(boxX, boxY, boxW, payBoxH).fillColor('#f9fafb').fill();
      doc.rect(boxX, boxY, boxW, payBoxH).strokeColor(TABLE_BORDER).lineWidth(0.5).stroke();
      doc.restore();
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      const lineY = (n: number) => boxY + 12 + n * 18;
      const payPad = 12;
      const labelW = 170;
      const valX = boxX + labelW;
      const valW = boxW - labelW - payPad;
      paymentRows.forEach((r, i) => {
        doc.text(r.label, boxX + payPad, lineY(i), { width: labelW - payPad * 2, align: 'left' });
        drawCellText(doc, formatMoney(r.amount), valX, lineY(i), valW - payPad, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
      });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
      doc.text('Total Received', boxX + payPad, lineY(paymentRows.length), { width: labelW - payPad * 2, align: 'left' });
      drawCellText(doc, formatMoney(totalReceived), valX, lineY(paymentRows.length), valW - payPad, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica-Bold' });
      y = boxY + payBoxH + 14;

      // Signature section (ERP audit footer)
      let sigY = y;
      if (sigY + sigH > bottomLimit()) {
        doc.addPage({ size: 'A4', margin: 30 });
        sigY = doc.page.margins.top + 8;
      }
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      const lineW = 180;
      // Prepared By auto-filled
      doc.text(`Prepared By: ${input.generatedBy}`, x, sigY);
      // Verified By blank for manual signature
      doc.text('Verified By:', x, sigY + 20);
      doc.moveTo(x + 78, sigY + 32).lineTo(x + 78 + lineW, sigY + 32).strokeColor('#9ca3af').lineWidth(1).stroke();
      // Date auto-filled
      doc.text(`Date: ${formatDateTime(input.generatedAt)}`, x, sigY + 44);
      doc.strokeColor('#000');

      applyPageFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function renderTaxPdf(input: {
  logoBuffer: Buffer | null;
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
      const doc = new PDFDocument({ margin: PDF_MARGIN, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      let y = drawHmsReportHeader(doc, {
        title: 'VAT Report',
        subtitle: 'Hospitality Management System',
        businessName: input.businessName,
        branchId: input.branchId,
        dateRange: input.dateRange,
        generatedAt: input.generatedAt,
        generatedBy: input.generatedBy,
      });

      // VAT Summary box
      const vatSummaryH = 72;
      doc.save();
      doc.roundedRect(x, y, pageWidth, vatSummaryH, 6).fillColor('#f9fafb').fill();
      doc.roundedRect(x, y, pageWidth, vatSummaryH, 6).lineWidth(0.5).strokeColor(TABLE_BORDER).stroke();
      doc.restore();
      const vatPad = 12;
      let vy = y + vatPad;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total Net Sales', x + vatPad, vy, { width: pageWidth - vatPad * 2 });
      doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatNumberTz(input.totals.net), x + vatPad, vy, { width: pageWidth - vatPad * 2, align: 'right' });
      vy += 14;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total VAT Collected', x + vatPad, vy, { width: pageWidth - vatPad * 2 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(formatNumberTz(input.totals.vat), x + vatPad, vy, { width: pageWidth - vatPad * 2, align: 'right' });
      vy += 14;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Total Gross Sales', x + vatPad, vy, { width: pageWidth - vatPad * 2 });
      doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatNumberTz(input.totals.gross), x + vatPad, vy, { width: pageWidth - vatPad * 2, align: 'right' });
      vy += 14;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('VAT Rate', x + vatPad, vy, { width: pageWidth - vatPad * 2 });
      doc.font('Helvetica').fontSize(10).fillColor('#000').text('18%', x + vatPad, vy, { width: pageWidth - vatPad * 2, align: 'right' });
      y = y + vatSummaryH + 16;

      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 24;

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

      const drawVatHeader = () => {
        doc.save();
        doc.rect(tableX, y, tableW, headerH).fillColor(TABLE_HEADER_BG).fill();
        doc.restore();
        doc.rect(tableX, y, tableW, headerH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(1).stroke();
        drawDividers(y, headerH, TABLE_BORDER_LIGHT);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        let cx = tableX;
        doc.text('Date', cx + padX, y + 9, { width: colW.date - padX * 2, align: 'left' });
        cx += colW.date;
        doc.text('Sector', cx + padX, y + 9, { width: colW.sector - padX * 2, align: 'left' });
        cx += colW.sector;
        doc.text('Net (TSh)', cx + padX, y + 9, { width: colW.net - padX * 2, align: 'right' });
        cx += colW.net;
        doc.font('Helvetica-Bold').fontSize(10).text('VAT (TSh)', cx + padX, y + 9, { width: colW.vat - padX * 2, align: 'right' });
        cx += colW.vat;
        doc.font('Helvetica-Bold').fontSize(10).text('Gross (TSh)', cx + padX, y + 9, { width: colW.gross - padX * 2, align: 'right' });
        y += headerH;
      };

      drawVatHeader();
      doc.font('Helvetica').fontSize(10).fillColor('#000');

      let idx = 0;
      for (const r of input.rows) {
        if (y + rowH > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: PDF_MARGIN });
          y = doc.page.margins.top + 8;
        }
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(tableX, y, tableW, rowH).fillColor(TABLE_ROW_STRIPE).fill();
          doc.restore();
        }
        doc.rect(tableX, y, tableW, rowH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(0.5).stroke();
        drawDividers(y, rowH, TABLE_BORDER_LIGHT);
        let cx = tableX;
        drawCellText(doc, formatDdMmYyyy(r.date), cx + padX, y + 7, colW.date - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.date;
        drawCellText(doc, toTitleCase(String(r.sector)), cx + padX, y + 7, colW.sector - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
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
        doc.addPage({ size: 'A4', margin: PDF_MARGIN });
        y = doc.page.margins.top + 8;
      }
      doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(1.5).strokeColor(TABLE_BORDER).stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(tableX, y, tableW, totalsH).fillColor(TABLE_HEADER_BG).fill();
      doc.restore();
      doc.rect(tableX, y, tableW, totalsH).strokeColor(TABLE_BORDER).lineWidth(1).stroke();
      drawDividers(y, totalsH, TABLE_BORDER_LIGHT);

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('TOTAL', tableX + padX, y + 11, { width: colW.date + colW.sector - padX * 2, align: 'left', lineBreak: false });
      let cx = tableX + colW.date + colW.sector;
      drawCellText(doc, formatNumberTz(input.totals.net), cx + padX, y + 11, colW.net - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });
      cx += colW.net;
      drawCellText(doc, formatNumberTz(input.totals.vat), cx + padX, y + 11, colW.vat - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });
      cx += colW.vat;
      drawCellText(doc, formatNumberTz(input.totals.gross), cx + padX, y + 11, colW.gross - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });

      applyPageFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function renderExpensesPdf(input: {
  logoBuffer: Buffer | null;
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
  return await new Promise((resolve, reject) => {
    try {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: PDF_MARGIN, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      const footerHeight = 30;
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - footerHeight;

      let y = drawHmsReportHeader(doc, {
        title: 'Expense Report',
        subtitle: 'Hospitality Management System',
        businessName: input.businessName,
        branchId: input.branchId,
        dateRange: input.dateRange,
        generatedAt: input.generatedAt,
        generatedBy: input.generatedBy,
      });

      const numTxns = input.rows.length;
      const amounts = input.rows.map((r) => Number(r.amount || 0)).filter((v) => Number.isFinite(v));
      const highest = amounts.length ? Math.max(...amounts) : 0;
      const positiveAmounts = amounts.filter((a) => a > 0);
      const lowest = positiveAmounts.length ? Math.min(...positiveAmounts) : 0;

      // Expense Summary box
      const summaryH = 88;
      doc.save();
      doc.roundedRect(x, y, pageWidth, summaryH, 6).fillColor('#f9fafb').fill();
      doc.roundedRect(x, y, pageWidth, summaryH, 6).lineWidth(0.5).strokeColor(TABLE_BORDER).stroke();
      doc.restore();
      const pad = 14;
      let sy = y + pad;
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text('Total Expenses', x + pad, sy, { width: pageWidth - pad * 2 });
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(formatNumberTz(input.total), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
      sy += 20;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Number of Transactions', x + pad, sy, { width: pageWidth - pad * 2 });
      doc.font('Helvetica').fontSize(10).fillColor('#000').text(String(numTxns), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
      sy += 16;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Highest Expense', x + pad, sy, { width: pageWidth - pad * 2 });
      doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatNumberTz(highest), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
      sy += 16;
      doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Lowest Expense', x + pad, sy, { width: pageWidth - pad * 2 });
      doc.font('Helvetica').fontSize(10).fillColor('#000').text(formatNumberTz(lowest), x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
      y = y + summaryH + 20;

      // Category summary
      const expenseByCategory: Record<string, number> = {};
      for (const r of input.rows) {
        const cat = toTitleCase(String(r.category || 'Other').trim() || 'Other');
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(r.amount || 0);
      }

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Expenses by Category', x, y);
      y += 16;

      const expColW = { category: 200, amount: 120 };
      const expTableW = expColW.category + expColW.amount;
      const expPadX = 6;
      const expHeaderH = 24;
      const expRowH = 20;

      doc.save();
      doc.rect(x, y, expTableW, expHeaderH).fillColor(TABLE_HEADER_BG).fill();
      doc.rect(x, y, expTableW, expHeaderH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(1).stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
      doc.text('Category', x + expPadX, y + 8, { width: expColW.category - expPadX * 2 });
      doc.text('Amount (TSh)', x + expColW.category + expPadX, y + 8, { width: expColW.amount - expPadX * 2, align: 'right' });
      y += expHeaderH;

      const categories = Object.keys(expenseByCategory).sort();
      let catIdx = 0;
      for (const cat of categories) {
        if (y + expRowH > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: PDF_MARGIN });
          y = doc.page.margins.top + 8;
        }
        if (catIdx % 2 === 1) {
          doc.save();
          doc.rect(x, y, expTableW, expRowH).fillColor(TABLE_ROW_STRIPE).fill();
          doc.restore();
        }
        doc.rect(x, y, expTableW, expRowH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(0.5).stroke();
        doc.font('Helvetica').fontSize(10).fillColor('#000');
        doc.text(cat, x + expPadX, y + 6, { width: expColW.category - expPadX * 2 });
        doc.text(formatNumberTz(expenseByCategory[cat]), x + expColW.category + expPadX, y + 6, { width: expColW.amount - expPadX * 2, align: 'right' });
        y += expRowH;
        catIdx++;
      }

      const totalRowH = 26;
      if (y + totalRowH > bottomLimit()) {
        doc.addPage({ size: 'A4', margin: PDF_MARGIN });
        y = doc.page.margins.top + 8;
      }
      doc.moveTo(x, y).lineTo(x + expTableW, y).lineWidth(1.5).strokeColor(TABLE_BORDER).stroke();
      doc.save();
      doc.rect(x, y, expTableW, totalRowH).fillColor(TABLE_HEADER_BG).fill();
      doc.rect(x, y, expTableW, totalRowH).strokeColor(TABLE_BORDER).lineWidth(1).stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('TOTAL', x + expPadX, y + 8, { width: expColW.category - expPadX * 2 });
      doc.text(formatNumberTz(input.total), x + expColW.category + expPadX, y + 8, { width: expColW.amount - expPadX * 2, align: 'right' });
      y += totalRowH + 16;

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Expense Transactions', x, y);
      y += 14;

      const hasMode = input.rows.some((r) => String(r.paymentMode || '').trim() && String(r.paymentMode) !== '-');
      const expCols = hasMode
        ? { date: 70, category: 90, description: 140, amount: 90, mode: 70 }
        : { date: 70, category: 100, description: 180, amount: 100 };
      const expW = hasMode
        ? expCols.date + expCols.category + expCols.description + expCols.amount + (expCols as { mode: number }).mode
        : expCols.date + expCols.category + expCols.description + expCols.amount;
      const expHeaderH2 = 26;
      const expRowH2 = 22;

      const drawExpHeader = () => {
        doc.save();
        doc.rect(x, y, expW, expHeaderH2).fillColor(TABLE_HEADER_BG).fill();
        doc.rect(x, y, expW, expHeaderH2).strokeColor(TABLE_BORDER_LIGHT).lineWidth(1).stroke();
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        doc.text('Date', x + expPadX, y + 8, { width: expCols.date - expPadX * 2 });
        doc.text('Category', x + expCols.date + expPadX, y + 8, { width: expCols.category - expPadX * 2 });
        doc.text('Description', x + expCols.date + expCols.category + expPadX, y + 8, { width: expCols.description - expPadX * 2 });
        doc.text('Amount (TSh)', x + expCols.date + expCols.category + expCols.description + expPadX, y + 8, { width: expCols.amount - expPadX * 2, align: 'right' });
        if (hasMode) doc.text('Mode', x + expCols.date + expCols.category + expCols.description + expCols.amount + expPadX, y + 8, { width: (expCols as { mode: number }).mode - expPadX * 2, align: 'center' });
        y += expHeaderH2;
      };

      drawExpHeader();
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      let expIdx = 0;
      for (const r of input.rows) {
        if (y + expRowH2 > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: PDF_MARGIN });
          y = doc.page.margins.top + 8;
        }
        if (expIdx % 2 === 1) {
          doc.save();
          doc.rect(x, y, expW, expRowH2).fillColor(TABLE_ROW_STRIPE).fill();
          doc.restore();
        }
        doc.rect(x, y, expW, expRowH2).strokeColor(TABLE_BORDER_LIGHT).lineWidth(0.5).stroke();
        drawCellText(doc, formatDdMmYyyy(r.date), x + expPadX, y + 6, expCols.date - expPadX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        drawCellTextBox(doc, toTitleCase(r.category), x + expCols.date + expPadX, y + 4, expCols.category - expPadX * 2, expRowH2 - 10, { align: 'left', size: 10, font: 'Helvetica' });
        drawCellTextBox(doc, String(r.description || '-'), x + expCols.date + expCols.category + expPadX, y + 4, expCols.description - expPadX * 2, expRowH2 - 10, { align: 'left', size: 10, font: 'Helvetica' });
        drawCellText(doc, formatNumberTz(r.amount), x + expCols.date + expCols.category + expCols.description + expPadX, y + 6, expCols.amount - expPadX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        if (hasMode) drawCellTextBox(doc, String(r.paymentMode || '-'), x + expCols.date + expCols.category + expCols.description + expCols.amount + expPadX, y + 4, (expCols as { mode: number }).mode - expPadX * 2, expRowH2 - 10, { align: 'center', size: 10, font: 'Helvetica' });
        y += expRowH2;
        expIdx++;
      }

      applyPageFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function renderPnlPdf(input: {
  logoBuffer: Buffer | null;
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
      const doc = new PDFDocument({ margin: PDF_MARGIN, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      const title = input.mode === 'expensesOnly' ? 'Expense Report' : 'Profit & Loss';
      const footerHeight = 30;
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - footerHeight;

      // Compute revenue by sector and expense by category
      const revenueBySector: Record<string, { net: number; vat: number; gross: number }> = {};
      for (const r of input.salesRows) {
        const sec = String(r.sector || 'OTHER').toUpperCase().replace(/\s+/g, '_');
        if (!revenueBySector[sec]) revenueBySector[sec] = { net: 0, vat: 0, gross: 0 };
        revenueBySector[sec].net += Number(r.net || 0);
        revenueBySector[sec].vat += Number(r.vat || 0);
        revenueBySector[sec].gross += Number(r.gross || 0);
      }
      const expenseByCategory: Record<string, number> = {};
      for (const r of input.expenseRows) {
        const cat = String(r.category || 'Other').trim() || 'Other';
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(r.amount || 0);
      }

      const maxRevenueRows = 22;
      const maxExpenseRows = 22;
      const salesRowsToShow = input.salesRows.slice(0, maxRevenueRows);
      const expenseRowsToShow = input.expenseRows.slice(0, maxExpenseRows);

      const ensureSpace = (h: number, currentY: number) => {
        if (currentY + h > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: 40 });
          return drawPnlContinuationTop(doc);
        }
        return currentY;
      };

      let y = drawPnlFirstPage(doc, {
        title,
        logoBuffer: input.logoBuffer,
        businessName: input.businessName,
        businessId: input.businessId,
        businessType: input.businessType,
        branchId: input.branchId,
        dateRange: input.dateRange,
        generatedAt: input.generatedAt,
        generatedBy: input.generatedBy,
        totals: input.totals,
        mode: input.mode,
      });

      // Page 2: Revenue by sector + transactions (P&L only)
      if (input.mode !== 'expensesOnly') {
        // Revenue by sector summary + transactions
        y = ensureSpace(80, y);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Revenue by Sector', x, y);
        y += 18;

        const revColW = { sector: 140, net: 90, vat: 80, gross: 100 };
        const revTableW = revColW.sector + revColW.net + revColW.vat + revColW.gross;
        const revPadX = 6;
        const revHeaderH = 26;
        const revRowH = 22;

        doc.save();
        doc.rect(x, y, revTableW, revHeaderH).fillColor(TABLE_HEADER_BG).fill();
        doc.restore();
        doc.rect(x, y, revTableW, revHeaderH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        doc.text('Sector', x + revPadX, y + 8, { width: revColW.sector - revPadX * 2 });
        doc.text('Net (TSh)', x + revColW.sector + revPadX, y + 8, { width: revColW.net - revPadX * 2, align: 'right' });
        doc.text('VAT (TSh)', x + revColW.sector + revColW.net + revPadX, y + 8, { width: revColW.vat - revPadX * 2, align: 'right' });
        doc.text('Gross (TSh)', x + revColW.sector + revColW.net + revColW.vat + revPadX, y + 8, { width: revColW.gross - revPadX * 2, align: 'right' });
        y += revHeaderH;

        const sectors = Object.keys(revenueBySector).sort();
        let revIdx = 0;
        for (const sec of sectors) {
          const d = revenueBySector[sec];
          const label = toTitleCase(sec.replace(/_/g, ' '));
          if (revIdx % 2 === 1) {
            doc.save();
            doc.rect(x, y, revTableW, revRowH).fillColor(TABLE_ROW_STRIPE).fill();
            doc.restore();
          }
          doc.font('Helvetica').fontSize(10).fillColor('#000');
          doc.rect(x, y, revTableW, revRowH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(0.5).stroke();
          doc.text(label, x + revPadX, y + 6, { width: revColW.sector - revPadX * 2 });
          doc.text(formatNumberTz(d.net), x + revColW.sector + revPadX, y + 6, { width: revColW.net - revPadX * 2, align: 'right' });
          doc.text(formatNumberTz(d.vat), x + revColW.sector + revColW.net + revPadX, y + 6, { width: revColW.vat - revPadX * 2, align: 'right' });
          doc.text(formatNumberTz(d.gross), x + revColW.sector + revColW.net + revColW.vat + revPadX, y + 6, { width: revColW.gross - revPadX * 2, align: 'right' });
          y += revRowH;
          revIdx++;
        }

        const revTotalH = 28;
        y = ensureSpace(revTotalH, y);
        doc.moveTo(x, y).lineTo(x + revTableW, y).lineWidth(1.5).strokeColor(TABLE_BORDER).stroke();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        doc.save();
        doc.rect(x, y, revTableW, revTotalH).fillColor(TABLE_HEADER_BG).fill();
        doc.rect(x, y, revTableW, revTotalH).strokeColor(TABLE_BORDER).lineWidth(1).stroke();
        doc.restore();
        doc.text('TOTAL', x + revPadX, y + 9, { width: revColW.sector - revPadX * 2 });
        doc.text(formatNumberTz(input.totals.net), x + revColW.sector + revPadX, y + 9, { width: revColW.net - revPadX * 2, align: 'right' });
        doc.text(formatNumberTz(input.totals.vat), x + revColW.sector + revColW.net + revPadX, y + 9, { width: revColW.vat - revPadX * 2, align: 'right' });
        doc.text(formatNumberTz(input.totals.gross), x + revColW.sector + revColW.net + revColW.vat + revPadX, y + 9, { width: revColW.gross - revPadX * 2, align: 'right' });
        y += revTotalH + 16;

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Revenue Transactions', x, y);
        y += 16;

        const colW = { date: 70, sector: 75, net: 75, vat: 65, gross: 85, mode: 90 };
        const tableW = colW.date + colW.sector + colW.net + colW.vat + colW.gross + colW.mode;
        const padX = 5;
        const headerH = 26;
        const rowH = 20;

        const drawRevHeader = () => {
          doc.save();
          doc.rect(x, y, tableW, headerH).fillColor(TABLE_HEADER_BG).fill();
          doc.restore();
          doc.rect(x, y, tableW, headerH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(1).stroke();
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
          doc.text('Date', x + padX, y + 8, { width: colW.date - padX * 2 });
          doc.text('Sector', x + colW.date + padX, y + 8, { width: colW.sector - padX * 2 });
          doc.text('Net', x + colW.date + colW.sector + padX, y + 8, { width: colW.net - padX * 2, align: 'right' });
          doc.text('VAT', x + colW.date + colW.sector + colW.net + padX, y + 8, { width: colW.vat - padX * 2, align: 'right' });
          doc.text('Gross', x + colW.date + colW.sector + colW.net + colW.vat + padX, y + 8, { width: colW.gross - padX * 2, align: 'right' });
          doc.text('Mode', x + colW.date + colW.sector + colW.net + colW.vat + colW.gross + padX, y + 8, { width: colW.mode - padX * 2, align: 'center' });
          y += headerH;
        };

        y = ensureSpace(headerH + rowH * salesRowsToShow.length + 32, y);
        drawRevHeader();

        doc.font('Helvetica').fontSize(9).fillColor('#000');
        let salesIdx = 0;
        for (const r of salesRowsToShow) {
          if (salesIdx % 2 === 1) {
            doc.save();
            doc.rect(x, y, tableW, rowH).fillColor(TABLE_ROW_STRIPE).fill();
            doc.restore();
          }
          doc.rect(x, y, tableW, rowH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(0.5).stroke();
          drawCellText(doc, formatDdMmYyyy(r.date), x + padX, y + 5, colW.date - padX * 2, { align: 'left', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, toTitleCase(String(r.sector)), x + colW.date + padX, y + 5, colW.sector - padX * 2, { align: 'left', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, formatNumberTz(r.net), x + colW.date + colW.sector + padX, y + 5, colW.net - padX * 2, { align: 'right', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, formatNumberTz(r.vat), x + colW.date + colW.sector + colW.net + padX, y + 5, colW.vat - padX * 2, { align: 'right', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, formatNumberTz(r.gross), x + colW.date + colW.sector + colW.net + colW.vat + padX, y + 5, colW.gross - padX * 2, { align: 'right', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, String(r.paymentMode || ''), x + colW.date + colW.sector + colW.net + colW.vat + colW.gross + padX, y + 5, colW.mode - padX * 2, { align: 'center', baseSize: 9, minSize: 8, font: 'Helvetica' });
          y += rowH;
          salesIdx++;
        }
        if (salesRowsToShow.length < input.salesRows.length) {
          doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(`(Showing ${salesRowsToShow.length} of ${input.salesRows.length} transactions)`, x, y + 4);
          y += 14;
        }
        y += 12;
      }

      // Expense by category + transactions
      y = ensureSpace(90, y);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Expenses by Category', x, y);
      y += 14;

      const expSumColW = { category: 200, amount: 120 };
      const expSumTableW = expSumColW.category + expSumColW.amount;
      const expPadX = 6;
      const expSumHeaderH = 24;
      const expSumRowH = 20;

      doc.save();
      doc.rect(x, y, expSumTableW, expSumHeaderH).fillColor(TABLE_HEADER_BG).fill();
      doc.restore();
      doc.rect(x, y, expSumTableW, expSumHeaderH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(1).stroke();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
      doc.text('Category', x + expPadX, y + 8, { width: expSumColW.category - expPadX * 2, align: 'left' });
      doc.text('Amount (TSh)', x + expSumColW.category + expPadX, y + 8, { width: expSumColW.amount - expPadX * 2, align: 'right' });
      y += expSumHeaderH;

      const categories = Object.keys(expenseByCategory).sort();
      let catIdx = 0;
      for (const cat of categories) {
        if (catIdx % 2 === 1) {
          doc.save();
          doc.rect(x, y, expSumTableW, expSumRowH).fillColor(TABLE_ROW_STRIPE).fill();
          doc.restore();
        }
        doc.font('Helvetica').fontSize(10).fillColor('#000');
        doc.rect(x, y, expSumTableW, expSumRowH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(0.5).stroke();
        doc.text(toTitleCase(cat), x + expPadX, y + 6, { width: expSumColW.category - expPadX * 2 });
        doc.text(formatNumberTz(expenseByCategory[cat]), x + expSumColW.category + expPadX, y + 6, { width: expSumColW.amount - expPadX * 2, align: 'right' });
        y += expSumRowH;
        catIdx++;
      }

      const expTotalH = 24;
      y = ensureSpace(expTotalH, y);
      doc.moveTo(x, y).lineTo(x + expSumTableW, y).lineWidth(1.5).strokeColor(TABLE_BORDER).stroke();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
      doc.save();
      doc.rect(x, y, expSumTableW, expTotalH).fillColor(TABLE_HEADER_BG).fill();
      doc.rect(x, y, expSumTableW, expTotalH).strokeColor(TABLE_BORDER).lineWidth(1).stroke();
      doc.restore();
      doc.text('TOTAL', x + expPadX, y + 7, { width: expSumColW.category - expPadX * 2 });
      doc.text(formatNumberTz(input.totals.expenses), x + expSumColW.category + expPadX, y + 7, { width: expSumColW.amount - expPadX * 2, align: 'right' });
      y += expTotalH + 12;

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Expense Transactions', x, y);
      y += 12;

      const expX = x;
      const expW = pageWidth;
      const expColW = { date: 70, category: 90, description: 140, amount: 90, mode: 70 };
      const expHeaderH = 26;
      const expRowH = 24;

      const drawExpHeader = () => {
        doc.save();
        doc.rect(expX, y, expW, expHeaderH).fillColor(TABLE_HEADER_BG).fill();
        doc.restore();
        doc.rect(expX, y, expW, expHeaderH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        doc.text('Date', expX + expPadX, y + 8, { width: expColW.date - expPadX * 2, align: 'left' });
        doc.text('Category', expX + expColW.date + expPadX, y + 8, { width: expColW.category - expPadX * 2, align: 'left' });
        doc.text('Description', expX + expColW.date + expColW.category + expPadX, y + 8, { width: expColW.description - expPadX * 2, align: 'left' });
        doc.text('Amount (TSh)', expX + expColW.date + expColW.category + expColW.description + expPadX, y + 8, { width: expColW.amount - expPadX * 2, align: 'right' });
        doc.text('Mode', expX + expColW.date + expColW.category + expColW.description + expColW.amount + expPadX, y + 8, { width: expColW.mode - expPadX * 2, align: 'center' });
        y += expHeaderH;
      };

      const expTableHeight = expHeaderH + expRowH * expenseRowsToShow.length + 32;
      y = ensureSpace(expTableHeight, y);
      drawExpHeader();

      doc.font('Helvetica').fontSize(9).fillColor('#000');
      let expTxnIdx = 0;
      for (const r of expenseRowsToShow) {
        if (y + expRowH > bottomLimit()) break;
        if (expTxnIdx % 2 === 1) {
          doc.save();
          doc.rect(expX, y, expW, expRowH).fillColor(TABLE_ROW_STRIPE).fill();
          doc.restore();
        }
        doc.rect(expX, y, expW, expRowH).strokeColor(TABLE_BORDER_LIGHT).lineWidth(0.5).stroke();
        drawCellText(doc, formatDdMmYyyy(r.date), expX + expPadX, y + 6, expColW.date - expPadX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        drawCellTextBox(doc, toTitleCase(r.category), expX + expColW.date + expPadX, y + 4, expColW.category - expPadX * 2, expRowH - 10, { align: 'left', size: 10, font: 'Helvetica' });
        drawCellTextBox(doc, String(r.description || '-'), expX + expColW.date + expColW.category + expPadX, y + 4, expColW.description - expPadX * 2, expRowH - 10, { align: 'left', size: 10, font: 'Helvetica' });
        drawCellText(doc, formatNumberTz(r.amount), expX + expColW.date + expColW.category + expColW.description + expPadX, y + 6, expColW.amount - expPadX * 2, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
        drawCellTextBox(doc, String(r.paymentMode || '-'), expX + expColW.date + expColW.category + expColW.description + expColW.amount + expPadX, y + 4, expColW.mode - expPadX * 2, expRowH - 10, { align: 'center', size: 10, font: 'Helvetica' });
        y += expRowH;
        expTxnIdx++;
      }
      if (expenseRowsToShow.length < input.expenseRows.length) {
        doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(`(Showing ${expenseRowsToShow.length} of ${input.expenseRows.length} transactions)`, expX, y + 4);
      }

      applyPageFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

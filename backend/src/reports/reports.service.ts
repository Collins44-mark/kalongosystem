import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
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
        const generatedAt = new Date();
        const branchLabel = normalizeBranchIdExport(branchId);
        const rangeFromLabel = from ? formatIsoDate(from) : 'ALL';
        const rangeToLabel = to ? formatIsoDate(to) : 'ALL';
        const generatedOnLabel = `${formatIsoDate(generatedAt)} ${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}`;

        // =========================
        // Sheet 1: Sales_Data (RAW)
        // =========================
        const wsData = wb.addWorksheet('Sales_Data');
        wsData.views = [{ state: 'frozen', ySplit: 1 }];

        const dataHeaders = [
          'Date',
          'Transaction_Type',
          'Sector',
          'Customer_Name',
          'Net_Amount',
          'VAT_Amount',
          'Gross_Amount',
          'Payment_Method',
          'Reference',
        ];

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

        // Excel table: raw data only, no totals row, no blank rows, filters enabled
        wsData.addTable({
          name: 'SalesData',
          ref: 'A1',
          headerRow: true,
          totalsRow: false,
          style: { theme: 'TableStyleLight9', showRowStripes: true },
          columns: dataHeaders.map((h) => ({ name: h, filterButton: true })),
          rows: dataRows,
        });

        // Header styling (bold, centered, light grey)
        const hdr = wsData.getRow(1);
        hdr.height = 18;
        hdr.eachCell((cell: any) => {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        });

        // Formatting rules
        // Monetary columns: Accounting format, 2 decimals
        for (const colIdx of [5, 6, 7]) {
          const col = wsData.getColumn(colIdx);
          col.numFmt = '#,##0.00';
          col.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        // Text columns left aligned
        for (const colIdx of [1, 2, 3, 4, 8, 9]) {
          wsData.getColumn(colIdx).alignment = { horizontal: 'left', vertical: 'middle' };
        }

        // Thin borders on all table cells (header + data)
        const borderThin = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        const lastRow = dataRows.length + 1;
        const lastCol = dataHeaders.length;
        for (let r = 1; r <= lastRow; r++) {
          const row = wsData.getRow(r);
          for (let c = 1; c <= lastCol; c++) {
            const cell = row.getCell(c);
            cell.border = borderThin;
          }
        }

        // Auto-fit columns
        wsData.columns.forEach((col: any) => {
          const header = String(col.values?.[1] ?? '');
          let max = header.length;
          col.eachCell({ includeEmpty: false }, (cell: any) => {
            const v = cell.value;
            let len = 0;
            if (v == null) len = 0;
            else if (typeof v === 'string') len = v.length;
            else if (typeof v === 'number') len = String(v.toFixed(2)).length;
            else len = String(v).length;
            if (len > max) max = len;
          });
          col.width = Math.min(42, Math.max(10, max + 2));
        });

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
        // Sheet 2: Sales_Summary
        // =========================
        const wsSum = wb.addWorksheet('Sales_Summary');

        // Layout widths (clean ERP look)
        wsSum.getColumn(1).width = 4;  // A
        wsSum.getColumn(2).width = 26; // B labels
        wsSum.getColumn(3).width = 26; // C values
        wsSum.getColumn(4).width = 4;  // D

        // Title (centered)
        wsSum.mergeCells('B2:C2');
        const titleCell = wsSum.getCell('B2');
        titleCell.value = 'SALES SUMMARY REPORT';
        titleCell.font = { bold: true, size: 16 };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Header info
        wsSum.getCell('B4').value = 'Business Name:';
        wsSum.getCell('C4').value = businessName;
        wsSum.getCell('B5').value = 'Branch:';
        wsSum.getCell('C5').value = branchLabel;
        wsSum.getCell('B6').value = 'Date Range:';
        wsSum.getCell('C6').value = `${rangeFromLabel} to ${rangeToLabel}`;
        wsSum.getCell('B7').value = 'Generated On:';
        wsSum.getCell('C7').value = generatedOnLabel;

        ['B4', 'B5', 'B6', 'B7'].forEach((addr) => {
          wsSum.getCell(addr).font = { bold: true };
          wsSum.getCell(addr).alignment = { horizontal: 'left', vertical: 'middle' };
        });
        ['C4', 'C5', 'C6', 'C7'].forEach((addr) => {
          wsSum.getCell(addr).alignment = { horizontal: 'left', vertical: 'middle' };
        });

        // Spacing
        wsSum.getRow(8).height = 8;

        // Totals box
        wsSum.getCell('B9').value = 'TOTALS';
        wsSum.getCell('B9').font = { bold: true };

        wsSum.getCell('B10').value = 'Total Net Revenue';
        wsSum.getCell('C10').value = { formula: 'SUM(Sales_Data!E:E)' };
        wsSum.getCell('B11').value = 'Total VAT';
        wsSum.getCell('C11').value = { formula: 'SUM(Sales_Data!F:F)' };
        wsSum.getCell('B12').value = 'Total Gross Revenue';
        wsSum.getCell('C12').value = { formula: 'SUM(Sales_Data!G:G)' };

        // Payment method breakdown
        wsSum.getRow(13).height = 8;
        wsSum.getCell('B14').value = 'PAYMENT METHOD BREAKDOWN';
        wsSum.getCell('B14').font = { bold: true };

        wsSum.getCell('B15').value = 'Cash Total';
        wsSum.getCell('C15').value = { formula: 'SUMIF(Sales_Data!H:H,"CASH",Sales_Data!G:G)' };
        wsSum.getCell('B16').value = 'Bank Total';
        wsSum.getCell('C16').value = { formula: 'SUMIF(Sales_Data!H:H,"BANK",Sales_Data!G:G)' };
        wsSum.getCell('B17').value = 'Mobile Money Total';
        wsSum.getCell('C17').value = { formula: 'SUMIF(Sales_Data!H:H,"MOBILE_MONEY",Sales_Data!G:G)' };
        wsSum.getCell('B18').value = 'Card Total';
        wsSum.getCell('C18').value = { formula: 'SUMIF(Sales_Data!H:H,"CARD",Sales_Data!G:G)' };

        // Formats + alignment
        ['C10', 'C11', 'C12', 'C15', 'C16', 'C17', 'C18'].forEach((addr) => {
          const c = wsSum.getCell(addr);
          c.numFmt = '#,##0.00';
          c.font = { bold: true };
          c.alignment = { horizontal: 'right', vertical: 'middle' };
        });
        ['B10', 'B11', 'B12', 'B15', 'B16', 'B17', 'B18'].forEach((addr) => {
          wsSum.getCell(addr).alignment = { horizontal: 'left', vertical: 'middle' };
        });

        // Bordered boxes around totals + breakdown
        const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        const boxBorder = borderThin;
        const applyBox = (top: number, bottom: number) => {
          for (let r = top; r <= bottom; r++) {
            for (let c = 2; c <= 3; c++) {
              const cell = wsSum.getRow(r).getCell(c);
              cell.border = boxBorder;
              if (r > top) cell.fill = fill;
            }
          }
        };
        applyBox(9, 12);
        applyBox(14, 18);

        // Page setup
        wsSum.pageSetup = {
          ...wsSum.pageSetup,
          horizontalCentered: true,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printArea: 'A1:D20',
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
  const top = doc.page.margins.top;

  // Logo (small, left) - max 80x50
  const logoW = 80;
  const logoH = 50;
  const canDrawLogo = input.logoBuffer && Buffer.isBuffer(input.logoBuffer) && input.logoBuffer.length > 0;
  if (canDrawLogo) {
    try {
      doc.image(input.logoBuffer, x, top, { fit: [logoW, logoH], align: 'left', valign: 'top' });
    } catch {
      /* ignore */
    }
  }

  // Business details (right aligned)
  const rightW = 200;
  const rightX = x + pageWidth - rightW;
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280');
  doc.text(input.businessName, rightX, top, { width: rightW, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor('#9ca3af');
  const f = input.dateRange.from ? input.dateRange.from.toISOString().slice(0, 10) : '-';
  const t = input.dateRange.to ? input.dateRange.to.toISOString().slice(0, 10) : '-';
  doc.text(`ID: ${input.businessId}  |  ${input.businessType}  |  Branch: ${input.branchId}`, rightX, top + 14, { width: rightW, align: 'right', lineBreak: false });
  doc.text(`Period: ${f} to ${t}`, rightX, top + 26, { width: rightW, align: 'right', lineBreak: false });
  doc.text(`Generated: ${formatDateTime(input.generatedAt)} by ${input.generatedBy}`, rightX, top + 38, { width: rightW, align: 'right', lineBreak: false });

  // Report title centered
  const titleY = top + 70;
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827');
  doc.text(input.title, x, titleY, { width: pageWidth, align: 'center', lineBreak: false });

  // Executive Summary (shaded block)
  const summaryTop = titleY + 28;
  const summaryH = input.mode === 'expensesOnly' ? 100 : 140;
  doc.save();
  doc.roundedRect(x, summaryTop, pageWidth, summaryH, 8).fillColor('#f8fafc').fill();
  doc.roundedRect(x, summaryTop, pageWidth, summaryH, 8).lineWidth(1).strokeColor('#e2e8f0').stroke();
  doc.restore();

  const pad = 16;
  let sy = summaryTop + pad;
  const lineH = 22;
  const kv = (label: string, value: string, highlight = false) => {
    doc.font('Helvetica').fontSize(10).fillColor('#64748b').text(label, x + pad, sy, { width: pageWidth - pad * 2 });
    doc.font(highlight ? 'Helvetica-Bold' : 'Helvetica').fontSize(highlight ? 12 : 10).fillColor(highlight ? '#059669' : '#111827').text(value, x + pad, sy, { width: pageWidth - pad * 2, align: 'right' });
    sy += lineH;
  };

  if (input.mode === 'expensesOnly') {
    kv('Total Expenses (TSh)', formatNumberTz(input.totals.expenses));
    kv('Net Result (TSh)', formatNumberTz(input.totals.netProfit), true);
  } else {
    kv('Total Net Revenue (TSh)', formatNumberTz(input.totals.net));
    kv('Total VAT (TSh)', formatNumberTz(input.totals.vat));
    kv('Total Gross Revenue (TSh)', formatNumberTz(input.totals.gross));
    kv('Total Expenses (TSh)', formatNumberTz(input.totals.expenses));
    kv('Net Profit (TSh)', formatNumberTz(input.totals.netProfit), true);
  }

  return summaryTop + summaryH + 24;
}

function drawPnlPageHeader(doc: any, input: {
  title: string;
  logoBuffer: Buffer | null;
  businessName: string;
  businessId: string;
  businessType: string;
  branchId: string;
  dateRange: { from?: Date; to?: Date };
  generatedAt: Date;
  generatedBy: string;
}): number {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  const top = doc.page.margins.top;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#374151').text(input.title, x, top, { width: pageWidth, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor('#9ca3af');
  const f = input.dateRange.from ? input.dateRange.from.toISOString().slice(0, 10) : '-';
  const t = input.dateRange.to ? input.dateRange.to.toISOString().slice(0, 10) : '-';
  doc.text(`${input.businessName}  |  ${f} to ${t}`, x, top + 14, { width: pageWidth, lineBreak: false });
  doc.moveTo(x, top + 32).lineTo(x + pageWidth, top + 32).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
  return top + 40;
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
      const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      const formatMoney = (n: number) => {
        const v = Number(n ?? 0);
        const safe = Number.isFinite(v) ? v : 0;
        return new Intl.NumberFormat('en-TZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
      };

      const drawBrandedFirstPageHeader = () => {
        const top = doc.page.margins.top;
        const rightW = 220;
        const leftW = pageWidth - rightW - 12;

        // Logo (business.logo_url) - first page only. No hardcoded fallback.
        let hasLogo = input.logoBuffer && Buffer.isBuffer(input.logoBuffer) && input.logoBuffer.length > 0;
        const logoW = 120;
        let logoH = 0;
        if (hasLogo) {
          try {
            const img = doc.openImage(input.logoBuffer);
            logoH = Math.round((img.height * logoW) / Math.max(1, img.width));
            doc.image(input.logoBuffer, x, top, { width: logoW });
          } catch {
            hasLogo = false;
            logoH = 0;
          }
        }

        // Right meta info
        const rightX = x + leftW + 12;
        doc.font('Helvetica').fontSize(10).fillColor('#374151');
        doc.text(`Generated On: ${formatDateTime(input.generatedAt)}`, rightX, top + 2, { width: rightW, align: 'right' });
        doc.text(`Generated By: ${input.generatedBy}`, rightX, top + 16, { width: rightW, align: 'right' });

        // Business info (shifts right if logo exists; otherwise starts at left margin)
        const infoX = x + (hasLogo ? logoW + 12 : 0);
        const infoW = leftW - (hasLogo ? logoW + 12 : 0);
        let yy = top;
        doc.font('Helvetica').fontSize(10).fillColor('#111827');
        doc.text(input.businessName, infoX, yy, { width: infoW, align: 'left', lineBreak: false }); yy += 13;
        doc.font('Helvetica').fontSize(10).fillColor('#374151');
        doc.text(`Business ID: ${input.businessId}`, infoX, yy, { width: infoW, align: 'left', lineBreak: false }); yy += 13;
        doc.text(`Branch ID: ${input.branchId}`, infoX, yy, { width: infoW, align: 'left', lineBreak: false }); yy += 13;
        doc.text(`Business Type: ${input.businessType}`, infoX, yy, { width: infoW, align: 'left', lineBreak: false }); yy += 13;
        const f = input.dateRange.from ? input.dateRange.from.toISOString().slice(0, 10) : '';
        const t = input.dateRange.to ? input.dateRange.to.toISOString().slice(0, 10) : '';
        doc.text(`Date Range: ${f} to ${t}`, infoX, yy, { width: infoW, align: 'left', lineBreak: false });

        const dividerY = Math.max(yy + 18, top + (hasLogo ? logoH : 0) + 10);
        doc.moveTo(x, dividerY).lineTo(x + pageWidth, dividerY).lineWidth(1).strokeColor('#e5e7eb').stroke();
        doc.strokeColor('#000');
        doc.fillColor('#000');

        // Center title
        const titleY = dividerY + 14;
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text('SALES REPORT', x, titleY, { width: pageWidth, align: 'center' });
        doc.fillColor('#000');
        return titleY + 28;
      };

      const drawDataOnlyPageHeader = () => {
        const top = doc.page.margins.top;
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text('SALES REPORT', x, top, { width: pageWidth, align: 'center' });
        doc.fillColor('#000');
        return top + 28;
      };

      const normalizePaymentLabel = (s: any) => {
        const pm = String(s || '').toUpperCase();
        if (pm.includes('CARD') || pm.includes('VISA') || pm.includes('MASTERCARD')) return 'Card';
        if (pm.includes('BANK') || pm.includes('TRANSFER') || pm.includes('EFT')) return 'Bank';
        if (pm.includes('MOBILE') || pm.includes('MPESA') || pm.includes('TIGO') || pm.includes('AIRTEL') || pm.includes('HALOPESA')) return 'Mobile Money';
        return 'Cash';
      };

      let isFirstPage = true;
      let y = drawBrandedFirstPageHeader();

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
        doc.text('Payment Method', cx + padX, y + 9, { width: colW.mode - padX * 2, align: 'left' });
        y += headerH;
      };

      drawHeader();
      doc.font('Helvetica').fontSize(10).fillColor('#000');

      let idx = 0;
      for (const r of input.rows) {
        if (y + rowH > bottomLimit()) {
          doc.addPage();
          isFirstPage = false;
          y = drawDataOnlyPageHeader();
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
        drawCellText(doc, formatIsoDate(r.date), cx + padX, y + 7, colW.date - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
        cx += colW.date;
        drawCellText(doc, String(r.sector), cx + padX, y + 7, colW.sector - padX * 2, { align: 'left', baseSize: 10, minSize: 9, font: 'Helvetica' });
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
        doc.addPage();
        isFirstPage = false;
        y = drawDataOnlyPageHeader();
        drawHeader();
      }
      doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(3).strokeColor('#111827').stroke();
      doc.strokeColor('#000');
      doc.save();
      doc.rect(tableX, y, tableW, totalsH).fillColor('#e5e7eb').fill();
      doc.restore();
      doc.rect(tableX, y, tableW, totalsH).strokeColor('#9ca3af').lineWidth(2).stroke();
      drawDividers(y, totalsH, '#d0d7de');
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('TOTAL SALES', tableX + padX, y + 11, { width: colW.date + colW.sector - padX * 2, align: 'left', lineBreak: false });
      let cx = tableX + colW.date + colW.sector;
      drawCellText(doc, formatMoney(input.totals.net), cx + padX, y + 11, colW.net - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });
      cx += colW.net;
      drawCellText(doc, formatMoney(input.totals.vat), cx + padX, y + 11, colW.vat - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });
      cx += colW.vat;
      drawCellText(doc, formatMoney(input.totals.gross), cx + padX, y + 11, colW.gross - padX * 2, { align: 'right', baseSize: 11, minSize: 9, font: 'Helvetica-Bold' });

      y += totalsH + 12;

      // Payment breakdown section
      const paymentRowsAll: Array<{ key: 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'CARD'; label: string; amount: number }> = [
        { key: 'CASH', label: 'Cash Total:', amount: paymentSummary.CASH },
        { key: 'BANK', label: 'Bank Total:', amount: paymentSummary.BANK },
        { key: 'MOBILE_MONEY', label: 'Mobile Money Total:', amount: paymentSummary.MOBILE_MONEY },
        { key: 'CARD', label: 'Card Total:', amount: paymentSummary.CARD },
      ];
      const paymentRows = paymentRowsAll.filter((r) => cents2(r.amount) !== 0);
      const payBoxH = Math.max(58, 22 + paymentRows.length * 18);
      const sigH = 64;
      if (y + payBoxH + sigH > bottomLimit()) {
        doc.addPage();
        isFirstPage = false;
        y = drawDataOnlyPageHeader();
      }

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Payment Summary', x, y, { width: pageWidth, align: 'center' });
      y += 10;
      const boxY = y;
      const boxW = Math.min(320, pageWidth);
      const boxX = x + (pageWidth - boxW) / 2;
      doc.rect(boxX, boxY, boxW, payBoxH).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      const lineY = (n: number) => boxY + 12 + n * 18;
      const pad = 12;
      const labelW = 170;
      const valX = boxX + labelW;
      const valW = boxW - labelW - pad;
      const kv = (i: number, label: string, amount: number) => {
        doc.text(label, boxX + pad, lineY(i), { width: labelW - pad * 2, align: 'left' });
        drawCellText(doc, formatMoney(amount), valX, lineY(i), valW - pad, { align: 'right', baseSize: 10, minSize: 9, font: 'Helvetica' });
      };
      paymentRows.forEach((r, i) => kv(i, r.label, r.amount));
      y = boxY + payBoxH + 14;

      // Signature section (ERP audit footer)
      let sigY = y;
      if (sigY + sigH > bottomLimit()) {
        doc.addPage();
        isFirstPage = false;
        sigY = drawDataOnlyPageHeader();
      }
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
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
      const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (e: any) => reject(e));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const x = doc.page.margins.left;
      let y = drawHeaderBlock(doc, {
        title: 'Tax Report',
        logoBuffer: input.logoBuffer,
        showLogo: true,
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
            logoBuffer: input.logoBuffer,
            showLogo: false,
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
          logoBuffer: input.logoBuffer,
          showLogo: false,
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
  return await renderPnlPdf({
    logoBuffer: input.logoBuffer,
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
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
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

      const drawMinimalHeader = (showLogo: boolean) =>
        drawPnlPageHeader(doc, {
          title,
          logoBuffer: showLogo ? input.logoBuffer : null,
          businessName: input.businessName,
          businessId: input.businessId,
          businessType: input.businessType,
          branchId: input.branchId,
          dateRange: input.dateRange,
          generatedAt: input.generatedAt,
          generatedBy: input.generatedBy,
        });

      const ensureSpace = (h: number, currentY: number) => {
        if (currentY + h > bottomLimit()) {
          doc.addPage({ size: 'A4', margin: 40 });
          return drawMinimalHeader(false);
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
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Revenue by Sector', x, y);
        y += 18;

        const revColW = { sector: 140, net: 90, vat: 80, gross: 100 };
        const revTableW = revColW.sector + revColW.net + revColW.vat + revColW.gross;
        const revPadX = 6;
        const revHeaderH = 26;
        const revRowH = 22;

        doc.save();
        doc.rect(x, y, revTableW, revHeaderH).fillColor('#f3f4f6').fill();
        doc.restore();
        doc.rect(x, y, revTableW, revHeaderH).strokeColor('#d1d5db').lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151');
        doc.text('Sector', x + revPadX, y + 8, { width: revColW.sector - revPadX * 2 });
        doc.text('Net (TSh)', x + revColW.sector + revPadX, y + 8, { width: revColW.net - revPadX * 2, align: 'right' });
        doc.text('VAT (TSh)', x + revColW.sector + revColW.net + revPadX, y + 8, { width: revColW.vat - revPadX * 2, align: 'right' });
        doc.text('Gross (TSh)', x + revColW.sector + revColW.net + revColW.vat + revPadX, y + 8, { width: revColW.gross - revPadX * 2, align: 'right' });
        y += revHeaderH;

        const sectors = Object.keys(revenueBySector).sort();
        for (const sec of sectors) {
          const d = revenueBySector[sec];
          const label = sec.replace(/_/g, ' ');
          doc.font('Helvetica').fontSize(10).fillColor('#111827');
          doc.rect(x, y, revTableW, revRowH).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
          doc.text(label, x + revPadX, y + 6, { width: revColW.sector - revPadX * 2 });
          doc.text(formatNumberTz(d.net), x + revColW.sector + revPadX, y + 6, { width: revColW.net - revPadX * 2, align: 'right' });
          doc.text(formatNumberTz(d.vat), x + revColW.sector + revColW.net + revPadX, y + 6, { width: revColW.vat - revPadX * 2, align: 'right' });
          doc.text(formatNumberTz(d.gross), x + revColW.sector + revColW.net + revColW.vat + revPadX, y + 6, { width: revColW.gross - revPadX * 2, align: 'right' });
          y += revRowH;
        }

        const revTotalH = 28;
        y = ensureSpace(revTotalH, y);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827');
        doc.rect(x, y, revTableW, revTotalH).fillColor('#e5e7eb').fill();
        doc.rect(x, y, revTableW, revTotalH).strokeColor('#d1d5db').lineWidth(1).stroke();
        doc.text('Total Revenue', x + revPadX, y + 9, { width: revColW.sector - revPadX * 2 });
        doc.text(formatNumberTz(input.totals.net), x + revColW.sector + revPadX, y + 9, { width: revColW.net - revPadX * 2, align: 'right' });
        doc.text(formatNumberTz(input.totals.vat), x + revColW.sector + revColW.net + revPadX, y + 9, { width: revColW.vat - revPadX * 2, align: 'right' });
        doc.text(formatNumberTz(input.totals.gross), x + revColW.sector + revColW.net + revColW.vat + revPadX, y + 9, { width: revColW.gross - revPadX * 2, align: 'right' });
        y += revTotalH + 16;

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Revenue Transactions', x, y);
        y += 16;

        const colW = { date: 70, sector: 75, net: 75, vat: 65, gross: 85, mode: 90 };
        const tableW = colW.date + colW.sector + colW.net + colW.vat + colW.gross + colW.mode;
        const padX = 5;
        const headerH = 26;
        const rowH = 20;

        const drawRevHeader = () => {
          doc.save();
          doc.rect(x, y, tableW, headerH).fillColor('#f3f4f6').fill();
          doc.restore();
          doc.rect(x, y, tableW, headerH).strokeColor('#d1d5db').lineWidth(1).stroke();
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
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

        doc.font('Helvetica').fontSize(9).fillColor('#111827');
        for (const r of salesRowsToShow) {
          doc.rect(x, y, tableW, rowH).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
          drawCellText(doc, formatDdMmYyyy(r.date), x + padX, y + 5, colW.date - padX * 2, { align: 'left', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, String(r.sector), x + colW.date + padX, y + 5, colW.sector - padX * 2, { align: 'left', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, formatNumberTz(r.net), x + colW.date + colW.sector + padX, y + 5, colW.net - padX * 2, { align: 'right', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, formatNumberTz(r.vat), x + colW.date + colW.sector + colW.net + padX, y + 5, colW.vat - padX * 2, { align: 'right', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, formatNumberTz(r.gross), x + colW.date + colW.sector + colW.net + colW.vat + padX, y + 5, colW.gross - padX * 2, { align: 'right', baseSize: 9, minSize: 8, font: 'Helvetica' });
          drawCellText(doc, String(r.paymentMode || ''), x + colW.date + colW.sector + colW.net + colW.vat + colW.gross + padX, y + 5, colW.mode - padX * 2, { align: 'center', baseSize: 9, minSize: 8, font: 'Helvetica' });
          y += rowH;
        }
        if (salesRowsToShow.length < input.salesRows.length) {
          doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(`(Showing ${salesRowsToShow.length} of ${input.salesRows.length} transactions)`, x, y + 4);
          y += 14;
        }
        y += 12;
      }

      // Expense by category + transactions
      y = ensureSpace(100, y);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Expenses by Category', x, y);
      y += 18;

      const expSumColW = { category: 200, amount: 120 };
      const expSumTableW = expSumColW.category + expSumColW.amount;
      const expPadX = 6;
      const expSumHeaderH = 26;
      const expSumRowH = 22;

      doc.save();
      doc.rect(x, y, expSumTableW, expSumHeaderH).fillColor('#f3f4f6').fill();
      doc.restore();
      doc.rect(x, y, expSumTableW, expSumHeaderH).strokeColor('#d1d5db').lineWidth(1).stroke();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151');
      doc.text('Category', x + expPadX, y + 8, { width: expSumColW.category - expPadX * 2 });
      doc.text('Amount (TSh)', x + expSumColW.category + expPadX, y + 8, { width: expSumColW.amount - expPadX * 2, align: 'right' });
      y += expSumHeaderH;

      const categories = Object.keys(expenseByCategory).sort();
      for (const cat of categories) {
        doc.font('Helvetica').fontSize(10).fillColor('#111827');
        doc.rect(x, y, expSumTableW, expSumRowH).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
        doc.text(cat, x + expPadX, y + 6, { width: expSumColW.category - expPadX * 2 });
        doc.text(formatNumberTz(expenseByCategory[cat]), x + expSumColW.category + expPadX, y + 6, { width: expSumColW.amount - expPadX * 2, align: 'right' });
        y += expSumRowH;
      }

      const expTotalH = 28;
      y = ensureSpace(expTotalH, y);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827');
      doc.rect(x, y, expSumTableW, expTotalH).fillColor('#e5e7eb').fill();
      doc.rect(x, y, expSumTableW, expTotalH).strokeColor('#d1d5db').lineWidth(1).stroke();
      doc.text('Total Expenses', x + expPadX, y + 9, { width: expSumColW.category - expPadX * 2 });
      doc.text(formatNumberTz(input.totals.expenses), x + expSumColW.category + expPadX, y + 9, { width: expSumColW.amount - expPadX * 2, align: 'right' });
      y += expTotalH + 16;

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Expense Transactions', x, y);
      y += 16;

      const expX = x;
      const expW = pageWidth;
      const expColW = { date: 70, category: 90, description: 140, amount: 90, mode: 70 };
      const expHeaderH = 26;
      const expRowH = 24;

      const drawExpHeader = () => {
        doc.save();
        doc.rect(expX, y, expW, expHeaderH).fillColor('#f3f4f6').fill();
        doc.restore();
        doc.rect(expX, y, expW, expHeaderH).strokeColor('#d1d5db').lineWidth(1).stroke();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
        doc.text('Date', expX + expPadX, y + 8, { width: expColW.date - expPadX * 2 });
        doc.text('Category', expX + expColW.date + expPadX, y + 8, { width: expColW.category - expPadX * 2 });
        doc.text('Description', expX + expColW.date + expColW.category + expPadX, y + 8, { width: expColW.description - expPadX * 2 });
        doc.text('Amount', expX + expColW.date + expColW.category + expColW.description + expPadX, y + 8, { width: expColW.amount - expPadX * 2, align: 'right' });
        doc.text('Mode', expX + expColW.date + expColW.category + expColW.description + expColW.amount + expPadX, y + 8, { width: expColW.mode - expPadX * 2, align: 'center' });
        y += expHeaderH;
      };

      const expTableHeight = expHeaderH + expRowH * expenseRowsToShow.length + 32;
      y = ensureSpace(expTableHeight, y);
      drawExpHeader();

      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      for (const r of expenseRowsToShow) {
        if (y + expRowH > bottomLimit()) break;
        doc.rect(expX, y, expW, expRowH).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
        drawCellText(doc, formatDdMmYyyy(r.date), expX + expPadX, y + 6, expColW.date - expPadX * 2, { align: 'left', baseSize: 9, minSize: 8, font: 'Helvetica' });
        drawCellTextBox(doc, String(r.category), expX + expColW.date + expPadX, y + 4, expColW.category - expPadX * 2, expRowH - 10, { align: 'left', size: 9, font: 'Helvetica' });
        drawCellTextBox(doc, String(r.description || '-'), expX + expColW.date + expColW.category + expPadX, y + 4, expColW.description - expPadX * 2, expRowH - 10, { align: 'left', size: 9, font: 'Helvetica' });
        drawCellText(doc, formatNumberTz(r.amount), expX + expColW.date + expColW.category + expColW.description + expPadX, y + 6, expColW.amount - expPadX * 2, { align: 'right', baseSize: 9, minSize: 8, font: 'Helvetica' });
        drawCellTextBox(doc, String(r.paymentMode || '-'), expX + expColW.date + expColW.category + expColW.description + expColW.amount + expPadX, y + 4, expColW.mode - expPadX * 2, expRowH - 10, { align: 'center', size: 9, font: 'Helvetica' });
        y += expRowH;
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

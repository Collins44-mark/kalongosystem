/**
 * HMS Excel Export API – Next.js App Router
 * Generates professional accounting Excel reports using exceljs.
 *
 * GET /api/reports/export?reportType=sales|tax|expenses|pnl&from=YYYY-MM-DD&to=YYYY-MM-DD&sector=all
 * Headers: Authorization: Bearer <token>
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import ExcelJS from 'exceljs';
import {
  toTitleCase,
  addHmsHeader,
  styleHeaderRow,
  styleDataRow,
  styleTotalRow,
  CURRENCY_FMT,
} from '@/lib/excel/hms-excel-utils';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function fetchBackend<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export async function GET(req: NextRequest) {
  try {
    const token = getToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const reportType = (searchParams.get('reportType') || 'sales').toLowerCase();
    const from = searchParams.get('from') || formatDate(new Date());
    const to = searchParams.get('to') || formatDate(new Date());
    const sector = searchParams.get('sector') || 'all';

    const validTypes = ['sales', 'tax', 'expenses', 'pnl'];
    const rt = validTypes.includes(reportType) ? reportType : 'sales';

    const period = `${from} to ${to}`;
    const generatedDate = formatDateTime(new Date());

    const wb = new ExcelJS.Workbook();
    const reportTitles: Record<string, string> = {
      sales: 'Sales Report',
      tax: 'VAT Report',
      expenses: 'Expenses Report',
      pnl: 'Profit & Loss Report',
    };

    let buffer: Buffer;
    let filename: string;

    if (rt === 'sales') {
      const data = await fetchBackend<{ total: number; rows: Array<{ date: string; sector: string; netAmount: number; vatAmount: number; grossAmount: number; paymentMode: string }> }>(
        `/finance/transactions?period=bydate&from=${from}&to=${to}&sector=${sector}&page=1&pageSize=500`,
        token,
      );
      const branch = 'Main';

      const ws = wb.addWorksheet('Sales_Data');
      let row = addHmsHeader(ws, {
        reportTitle: reportTitles.sales,
        branchName: branch,
        period,
        generatedDate,
      });

      const totalNet = data.rows.reduce((s, r) => s + Number(r.netAmount || 0), 0);
      const totalVat = data.rows.reduce((s, r) => s + Number(r.vatAmount || 0), 0);
      const totalGross = data.rows.reduce((s, r) => s + Number(r.grossAmount || 0), 0);

      ws.mergeCells(row, 1, row, 4);
      ws.getCell(row, 1).value = 'Summary';
      ws.getCell(row, 1).font = { bold: true };
      row += 2;

      const summaryRows = [
        ['Total Net Revenue', totalNet],
        ['Total VAT', totalVat],
        ['Total Gross Revenue', totalGross],
      ];
      for (const [label, val] of summaryRows) {
        ws.getCell(row, 1).value = label;
        ws.getCell(row, 2).value = val;
        ws.getCell(row, 2).numFmt = CURRENCY_FMT;
        ws.getCell(row, 2).alignment = { horizontal: 'right' };
        row++;
      }
      row += 2;

      const headers = ['Date', 'Sector', 'Net (TSh)', 'VAT (TSh)', 'Gross (TSh)', 'Payment Method'];
      const headerRow = ws.getRow(row);
      headers.forEach((h, i) => headerRow.getCell(i + 1).value = h);
      styleHeaderRow(headerRow, headers.length);
      row++;

      const sorted = [...data.rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      sorted.forEach((r, i) => {
        const dataRow = ws.getRow(row);
        dataRow.getCell(1).value = r.date?.slice(0, 10) || '';
        dataRow.getCell(2).value = toTitleCase(r.sector || '');
        dataRow.getCell(3).value = Number(r.netAmount || 0);
        dataRow.getCell(4).value = Number(r.vatAmount || 0);
        dataRow.getCell(5).value = Number(r.grossAmount || 0);
        dataRow.getCell(6).value = r.paymentMode || '';
        dataRow.getCell(3).numFmt = CURRENCY_FMT;
        dataRow.getCell(4).numFmt = CURRENCY_FMT;
        dataRow.getCell(5).numFmt = CURRENCY_FMT;
        dataRow.getCell(3).alignment = { horizontal: 'right' };
        dataRow.getCell(4).alignment = { horizontal: 'right' };
        dataRow.getCell(5).alignment = { horizontal: 'right' };
        styleDataRow(dataRow, 6, i % 2 === 1);
        row++;
      });

      const totalRow = ws.getRow(row);
      totalRow.getCell(1).value = 'TOTAL SALES';
      totalRow.getCell(3).value = totalNet;
      totalRow.getCell(4).value = totalVat;
      totalRow.getCell(5).value = totalGross;
      totalRow.getCell(3).numFmt = CURRENCY_FMT;
      totalRow.getCell(4).numFmt = CURRENCY_FMT;
      totalRow.getCell(5).numFmt = CURRENCY_FMT;
      styleTotalRow(totalRow, 6);
      row++;

      ws.columns = [
        { width: 12 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 16 },
      ];
      ws.views = [{ state: 'frozen', ySplit: row - sorted.length - 2 }];

      const buf = await wb.xlsx.writeBuffer();
      buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
      filename = `sales-report-${formatDate(new Date())}.xlsx`;
    } else if (rt === 'tax') {
      const data = await fetchBackend<{ total: number; rows: Array<{ date: string; sector: string; netAmount: number; vatAmount: number; grossAmount: number }> }>(
        `/finance/transactions?period=bydate&from=${from}&to=${to}&sector=${sector}&page=1&pageSize=500`,
        token,
      );
      const totalNet = data.rows.reduce((s, r) => s + Number(r.netAmount || 0), 0);
      const totalVat = data.rows.reduce((s, r) => s + Number(r.vatAmount || 0), 0);
      const totalGross = data.rows.reduce((s, r) => s + Number(r.grossAmount || 0), 0);

      const ws = wb.addWorksheet('VAT_Data');
      let row = addHmsHeader(ws, {
        reportTitle: reportTitles.tax,
        branchName: 'Main',
        period,
        generatedDate,
      });

      const vatSummary = [
        ['Total Net Sales', totalNet],
        ['Total VAT Collected', totalVat],
        ['VAT Rate', '18%'],
        ['Total Gross Sales', totalGross],
      ];
      ws.mergeCells(row, 1, row, 4);
      ws.getCell(row, 1).value = 'VAT Summary';
      ws.getCell(row, 1).font = { bold: true };
      row += 2;
      for (const [label, val] of vatSummary) {
        ws.getCell(row, 1).value = label;
        ws.getCell(row, 2).value = typeof val === 'number' ? val : val;
        if (typeof val === 'number') {
          ws.getCell(row, 2).numFmt = CURRENCY_FMT;
          ws.getCell(row, 2).alignment = { horizontal: 'right' };
        }
        row++;
      }
      row += 2;

      const headers = ['Date', 'Sector', 'Net (TSh)', 'VAT (TSh)', 'Gross (TSh)'];
      const headerRow = ws.getRow(row);
      headers.forEach((h, i) => headerRow.getCell(i + 1).value = h);
      headerRow.getCell(3).font = { bold: true };
      styleHeaderRow(headerRow, 5);
      row++;

      const sorted = [...data.rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      sorted.forEach((r, i) => {
        const dataRow = ws.getRow(row);
        dataRow.getCell(1).value = r.date?.slice(0, 10) || '';
        dataRow.getCell(2).value = toTitleCase(r.sector || '');
        dataRow.getCell(3).value = Number(r.netAmount || 0);
        dataRow.getCell(4).value = Number(r.vatAmount || 0);
        dataRow.getCell(5).value = Number(r.grossAmount || 0);
        [3, 4, 5].forEach((c) => {
          dataRow.getCell(c).numFmt = CURRENCY_FMT;
          dataRow.getCell(c).alignment = { horizontal: 'right' };
        });
        styleDataRow(dataRow, 5, i % 2 === 1);
        row++;
      });

      const totalRow = ws.getRow(row);
      totalRow.getCell(1).value = 'Total Net Sales';
      totalRow.getCell(3).value = totalNet;
      totalRow.getCell(4).value = totalVat;
      totalRow.getCell(5).value = totalGross;
      [3, 4, 5].forEach((c) => {
        totalRow.getCell(c).numFmt = CURRENCY_FMT;
      });
      styleTotalRow(totalRow, 5);
      row++;

      ws.columns = [{ width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
      const buf2 = await wb.xlsx.writeBuffer();
      buffer = Buffer.isBuffer(buf2) ? buf2 : Buffer.from(buf2 as ArrayBuffer);
      filename = `vat-report-${formatDate(new Date())}.xlsx`;
    } else if (rt === 'expenses') {
      const data = await fetchBackend<{ expenses: Array<{ expenseDate: string; category: string; description: string; amount: number }>; total?: number }>(
        `/finance/expenses?from=${from}&to=${to}`,
        token,
      );
      const rows = data.expenses || [];
      const total = data.total ?? rows.reduce((s, r) => s + Number(r.amount || 0), 0);

      const ws = wb.addWorksheet('Expenses_Data');
      let row = addHmsHeader(ws, {
        reportTitle: reportTitles.expenses,
        branchName: 'Main',
        period,
        generatedDate,
      });

      ws.mergeCells(row, 1, row, 4);
      ws.getCell(row, 1).value = 'Summary';
      ws.getCell(row, 1).font = { bold: true };
      row += 2;
      ws.getCell(row, 1).value = 'Total Expenses';
      ws.getCell(row, 2).value = total;
      ws.getCell(row, 2).numFmt = CURRENCY_FMT;
      ws.getCell(row, 2).alignment = { horizontal: 'right' };
      ws.getCell(row, 2).font = { bold: true };
      row += 2;

      const headers = ['Date', 'Category', 'Description', 'Amount (TSh)'];
      const headerRow = ws.getRow(row);
      headers.forEach((h, i) => headerRow.getCell(i + 1).value = h);
      styleHeaderRow(headerRow, 4);
      row++;

      const sorted = [...rows].sort((a, b) => new Date(a.expenseDate).getTime() - new Date(b.expenseDate).getTime());
      sorted.forEach((r, i) => {
        const dataRow = ws.getRow(row);
        dataRow.getCell(1).value = r.expenseDate?.slice(0, 10) || '';
        dataRow.getCell(2).value = toTitleCase(r.category || '');
        dataRow.getCell(3).value = String(r.description || '');
        dataRow.getCell(4).value = Number(r.amount || 0);
        dataRow.getCell(4).numFmt = CURRENCY_FMT;
        dataRow.getCell(4).alignment = { horizontal: 'right' };
        styleDataRow(dataRow, 4, i % 2 === 1);
        row++;
      });

      const totalRow = ws.getRow(row);
      totalRow.getCell(1).value = 'TOTAL';
      totalRow.getCell(4).value = total;
      totalRow.getCell(4).numFmt = CURRENCY_FMT;
      styleTotalRow(totalRow, 4);
      row++;

      ws.columns = [{ width: 12 }, { width: 18 }, { width: 36 }, { width: 14 }];
      const buf3 = await wb.xlsx.writeBuffer();
      buffer = Buffer.isBuffer(buf3) ? buf3 : Buffer.from(buf3 as ArrayBuffer);
      filename = `expenses-report-${formatDate(new Date())}.xlsx`;
    } else {
      const [dash, overview, txnsData] = await Promise.all([
        fetchBackend<{ totalRevenue?: number; totalExpenses?: number; netProfit?: number }>(
          `/finance/dashboard?from=${from}&to=${to}`,
          token,
        ),
        fetchBackend<{ totals?: { netRevenue?: number; grossSales?: number; vatCollected?: number } }>(
          `/finance/overview?period=bydate&from=${from}&to=${to}`,
          token,
        ).catch(() => ({})),
        fetchBackend<{ rows: Array<{ date: string; sector: string; netAmount: number; vatAmount: number; grossAmount: number }> }>(
          `/finance/transactions?period=bydate&from=${from}&to=${to}&sector=${sector}&page=1&pageSize=500`,
          token,
        ),
      ]);

      const ov = overview && 'totals' in overview ? overview : { totals: undefined };
      const totalGross = ov.totals?.grossSales ?? dash.totalRevenue ?? 0;
      const totalVat = ov.totals?.vatCollected ?? 0;
      const totalNet = ov.totals?.netRevenue ?? totalGross - totalVat;
      const totalExpenses = dash.totalExpenses ?? 0;
      const netProfit = dash.netProfit ?? totalNet - totalExpenses;

      const ws = wb.addWorksheet('P&L');
      let row = addHmsHeader(ws, {
        reportTitle: reportTitles.pnl,
        branchName: 'Main',
        period,
        generatedDate,
      });

      ws.mergeCells(row, 1, row, 4);
      ws.getCell(row, 1).value = 'Summary';
      ws.getCell(row, 1).font = { bold: true };
      row += 2;

      ws.getCell(row, 1).value = 'Total Revenue (Gross)';
      ws.getCell(row, 2).value = totalGross;
      ws.getCell(row, 2).numFmt = CURRENCY_FMT;
      ws.getCell(row, 2).alignment = { horizontal: 'right' };
      row++;

      ws.getCell(row, 1).value = 'Total Expenses';
      ws.getCell(row, 2).value = totalExpenses;
      ws.getCell(row, 2).numFmt = CURRENCY_FMT;
      ws.getCell(row, 2).alignment = { horizontal: 'right' };
      row++;

      ws.getCell(row, 1).value = 'Net Profit';
      ws.getCell(row, 2).value = netProfit;
      ws.getCell(row, 2).numFmt = CURRENCY_FMT;
      ws.getCell(row, 2).alignment = { horizontal: 'right' };
      ws.getCell(row, 1).font = { bold: true };
      ws.getCell(row, 2).font = { bold: true, size: 14, color: { argb: netProfit >= 0 ? 'FF059669' : 'FFDC2626' } };
      row++;

      const marginPct = totalGross > 0 ? (netProfit / totalGross) * 100 : 0;
      ws.getCell(row, 1).value = 'Profit Margin (%)';
      ws.getCell(row, 2).value = `${marginPct.toFixed(1)}%`;
      ws.getCell(row, 2).alignment = { horizontal: 'right' };
      row += 2;

      const headers = ['Date', 'Sector', 'Net (TSh)', 'Gross (TSh)'];
      const headerRow = ws.getRow(row);
      headers.forEach((h, i) => headerRow.getCell(i + 1).value = h);
      styleHeaderRow(headerRow, 4);
      row++;

      const txns = txnsData.rows || [];
      const sortedTxns = [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      sortedTxns.forEach((r, i) => {
        const dataRow = ws.getRow(row);
        dataRow.getCell(1).value = r.date?.slice(0, 10) || '';
        dataRow.getCell(2).value = toTitleCase(r.sector || '');
        dataRow.getCell(3).value = Number(r.netAmount || 0);
        dataRow.getCell(4).value = Number(r.grossAmount || 0);
        [3, 4].forEach((c) => {
          dataRow.getCell(c).numFmt = CURRENCY_FMT;
          dataRow.getCell(c).alignment = { horizontal: 'right' };
        });
        styleDataRow(dataRow, 4, i % 2 === 1);
        row++;
      });

      const totalRow = ws.getRow(row);
      totalRow.getCell(1).value = 'TOTAL';
      totalRow.getCell(3).value = totalNet;
      totalRow.getCell(4).value = totalGross;
      [3, 4].forEach((c) => {
        totalRow.getCell(c).numFmt = CURRENCY_FMT;
      });
      styleTotalRow(totalRow, 4);

      ws.columns = [{ width: 12 }, { width: 22 }, { width: 16 }, { width: 16 }];
      const buf4 = await wb.xlsx.writeBuffer();
      buffer = Buffer.isBuffer(buf4) ? buf4 : Buffer.from(buf4 as ArrayBuffer);
      filename = `pnl-report-${formatDate(new Date())}.xlsx`;
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Excel export error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 },
    );
  }
}

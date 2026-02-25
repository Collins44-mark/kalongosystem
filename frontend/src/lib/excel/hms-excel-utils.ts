/**
 * HMS Excel report utilities – professional accounting format.
 * Shared styling and structure for all reports.
 */

import type ExcelJS from 'exceljs';

export const CURRENCY_FMT = '#,##0.00';
export const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEFEFEF' },
};
export const ROW_STRIPE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF9FAFB' },
};
export const TOTAL_ROW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' },
};
export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

export function formatMoney(n: number): string {
  const v = Number(n ?? 0);
  const safe = Number.isFinite(v) ? v : 0;
  return new Intl.NumberFormat('en-TZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function toTitleCase(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function addHmsHeader(
  ws: ExcelJS.Worksheet,
  opts: {
    reportTitle: string;
    branchName: string;
    period: string;
    generatedDate: string;
  },
): number {
  const colCount = 6;
  const startRow = 1;

  ws.mergeCells(startRow, 1, startRow, colCount);
  const titleCell = ws.getCell(startRow, 1);
  titleCell.value = 'HMS';
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center' };

  ws.mergeCells(startRow + 1, 1, startRow + 1, colCount);
  ws.getCell(startRow + 1, 1).value = 'Hospitality Management System';
  ws.getCell(startRow + 1, 1).font = { size: 10 };
  ws.getCell(startRow + 1, 1).alignment = { horizontal: 'center' };

  ws.mergeCells(startRow + 2, 1, startRow + 2, colCount);
  ws.getCell(startRow + 2, 1).value = opts.reportTitle;
  ws.getCell(startRow + 2, 1).font = { bold: true, size: 12 };
  ws.getCell(startRow + 2, 1).alignment = { horizontal: 'center' };

  ws.mergeCells(startRow + 3, 1, startRow + 3, colCount);
  ws.getCell(startRow + 3, 1).value = opts.branchName;
  ws.getCell(startRow + 3, 1).alignment = { horizontal: 'center' };

  ws.mergeCells(startRow + 4, 1, startRow + 4, colCount);
  ws.getCell(startRow + 4, 1).value = `Period: ${opts.period}`;
  ws.getCell(startRow + 4, 1).alignment = { horizontal: 'center' };

  ws.mergeCells(startRow + 5, 1, startRow + 5, colCount);
  ws.getCell(startRow + 5, 1).value = `Generated: ${opts.generatedDate}`;
  ws.getCell(startRow + 5, 1).alignment = { horizontal: 'center' };

  return startRow + 6;
}

export function styleHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.font = { bold: true };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
  row.fill = HEADER_FILL;
  row.height = 20;
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).border = THIN_BORDER;
  }
}

export function styleDataRow(
  row: ExcelJS.Row,
  colCount: number,
  stripe: boolean,
): void {
  if (stripe) row.fill = ROW_STRIPE_FILL;
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).border = THIN_BORDER;
  }
}

export function styleTotalRow(row: ExcelJS.Row, colCount: number): void {
  row.font = { bold: true };
  row.fill = TOTAL_ROW_FILL;
  const thickTopBorder = { top: { style: 'medium' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.border = thickTopBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
  }
}

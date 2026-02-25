/**
 * Shared HMS Excel export utilities for consistent report formatting.
 */

export const CURRENCY_FMT = 'TSh #,##0.00';
export const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };
export const BORDER_THIN = {
  top: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
  left: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
  right: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
};

export function addHmsReportHeader(
  ws: any,
  opts: { title: string; businessName: string; period: string },
): number {
  const startRow = 1;
  ws.getCell(`A${startRow}`).value = 'HMS';
  ws.getCell(`A${startRow}`).font = { bold: true, size: 14 };
  ws.getCell(`A${startRow + 1}`).value = opts.title;
  ws.getCell(`A${startRow + 1}`).font = { bold: true, size: 12 };
  ws.getCell(`A${startRow + 2}`).value = opts.businessName;
  ws.getCell(`A${startRow + 3}`).value = `Period: ${opts.period}`;
  return startRow + 4;
}

export function applyHeaderRowStyle(row: any, colCount: number): void {
  row.height = 18;
  row.eachCell((cell: any) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = HEADER_FILL;
  });
}

export function autoSizeColumns(ws: any, minW = 10, maxW = 42): void {
  ws.columns.forEach((col: any) => {
    if (!col) return;
    let max = 0;
    col.eachCell({ includeEmpty: false }, (cell: any) => {
      const v = cell.value;
      let len = 0;
      if (v == null) len = 0;
      else if (typeof v === 'string') len = v.length;
      else if (typeof v === 'number') len = String(v.toFixed(2)).length;
      else len = String(v).length;
      if (len > max) max = len;
    });
    col.width = Math.min(maxW, Math.max(minW, max + 2));
  });
}

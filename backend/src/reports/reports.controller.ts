import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard, RolesGuard)
@RequireModule('reports')
@Roles('MANAGER', 'ADMIN', 'OWNER', 'FINANCE')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  private toDateRange(from?: string, to?: string): { from: Date; to: Date } | undefined {
    if (!from || !to) return undefined;
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }

  @Get('sales')
  async sales(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = this.toDateRange(from, to);
    const branchId = user.branchId || 'main';
    return this.reports.getSalesReport(
      user.businessId,
      branchId,
      range?.from,
      range?.to,
    );
  }

  @Get('finance')
  async finance(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = this.toDateRange(from, to);
    return this.reports.getFinanceReport(
      user.businessId,
      user.branchId,
      range?.from,
      range?.to,
    );
  }

  @Get('payroll')
  async payroll(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.reports.getPayrollReport(
      user.businessId,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  @Get('bookings')
  async bookings(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = this.toDateRange(from, to);
    return this.reports.getBookingsReport(
      user.businessId,
      user.branchId,
      range?.from,
      range?.to,
    );
  }

  @Get('export')
  async export(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('reportType') reportType?: string,
    @Query('format') format?: string,
    @Query('sector') sector?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rt = (reportType ?? 'sales').toLowerCase();
    const fmt = (format === 'xlsx' || format === 'pdf' ? format : 'csv').toLowerCase();
    const sec = (sector ?? 'all').toLowerCase();
    let range = this.toDateRange(from, to);
    if (!range && (!from || !to)) {
      const today = new Date().toISOString().slice(0, 10);
      range = this.toDateRange(today, today);
    }

    const branchId = user.branchId || 'main';
    const payload = await this.reports.exportReport(
      user.businessId,
      branchId,
      rt,
      fmt,
      sec,
      range?.from,
      range?.to,
    );

    res.setHeader('Content-Type', payload.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    return res.send(payload.body);
  }
}

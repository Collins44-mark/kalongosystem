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
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
@UseGuards(RolesGuard)
@RequireModule('reports')
@Roles('MANAGER', 'FINANCE')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('sales')
  async sales(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.getSalesReport(
      user.businessId,
      user.branchId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('finance')
  async finance(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.getFinanceReport(
      user.businessId,
      user.branchId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
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
    return this.reports.getBookingsReport(
      user.businessId,
      user.branchId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
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
    const rt = (reportType ?? 'revenue').toLowerCase();
    const fmt = (format ?? 'csv').toLowerCase();
    const sec = (sector ?? 'all').toLowerCase();

    const payload = await this.reports.exportReport(
      user.businessId,
      user.branchId,
      rt,
      fmt,
      sec,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );

    res.setHeader('Content-Type', payload.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    return res.send(payload.body);
  }
}

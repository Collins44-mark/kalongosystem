import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@UseGuards(RolesGuard)
@Roles('MANAGER')
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
}

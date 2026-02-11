import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

class CreateExpenseDto {
  @IsString()
  @IsIn(['HOUSEKEEPING', 'MAINTENANCE', 'UTILITIES', 'OTHERS'])
  category: string;
  @IsNumber()
  @Min(0)
  amount: number;
  @IsString()
  @IsOptional()
  description?: string;
  @IsDateString()
  expenseDate: string;
}

@Controller('finance')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class FinanceController {
  constructor(private finance: FinanceService) {}

  private getRangeFromQuery(period: 'today' | 'week' | 'month' | 'bydate', from?: string, to?: string) {
    const now = new Date();
    const endOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(23, 59, 59, 999);
      return x;
    };
    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    if (period === 'bydate' && from && to) {
      return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
    }
    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    if (period === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    // today default
    return { from: startOfDay(now), to: endOfDay(now) };
  }

  @Get('revenue')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async getRevenue(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.getRevenue(
      user.businessId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('expenses')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async getExpenses(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.getExpenses(
      user.businessId,
      user.branchId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post('expenses')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async createExpense(@CurrentUser() user: any, @Body() dto: CreateExpenseDto) {
    return this.finance.createExpense(
      user.businessId,
      user.branchId,
      {
        ...dto,
        expenseDate: new Date(dto.expenseDate),
      },
      user.sub,
    );
  }

  @Get('net-profit')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async getNetProfit(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.getNetProfit(
      user.businessId,
      user.branchId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async getDashboard(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.getDashboard(
      user.businessId,
      user.branchId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('revenue/sector/:sector')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async getRevenueSalesHistory(
    @CurrentUser() user: any,
    @Param('sector') sector: 'bar' | 'restaurant' | 'hotel',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.getRevenueSalesHistory(
      user.businessId,
      sector,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('expenses/by-category')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async getExpensesByCategory(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.getExpensesByCategory(
      user.businessId,
      user.branchId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async overview(
    @CurrentUser() user: any,
    @Query('period') period?: 'today' | 'week' | 'month' | 'bydate',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const p = period && ['today', 'week', 'month', 'bydate'].includes(period) ? period : 'today';
    const range = this.getRangeFromQuery(p, from, to);
    return this.finance.getOverview(user.businessId, range.from, range.to);
  }

  @Get('transactions')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'FINANCE')
  async transactions(
    @CurrentUser() user: any,
    @Query('period') period?: 'today' | 'week' | 'month' | 'bydate',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sector') sector?: 'all' | 'rooms' | 'bar' | 'restaurant',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = period && ['today', 'week', 'month', 'bydate'].includes(period) ? period : 'today';
    const s = sector && ['all', 'rooms', 'bar', 'restaurant'].includes(sector) ? sector : 'all';
    const range = this.getRangeFromQuery(p, from, to);
    const pg = Math.max(1, Number(page || 1) || 1);
    const ps = Math.min(100, Math.max(10, Number(pageSize || 20) || 20));
    return this.finance.getTransactions(user.businessId, range.from, range.to, s, pg, ps);
  }
}

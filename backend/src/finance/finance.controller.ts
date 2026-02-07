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

  @Get('revenue')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
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
  @Roles('MANAGER')
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
  @Roles('MANAGER')
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
  @Roles('MANAGER')
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
  @Roles('MANAGER')
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
  @Roles('MANAGER')
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
}

import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { OtherRevenueService } from './other-revenue.service';

class CreateRevenueCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  linkedQuickBooksAccountId?: string;
}

class UpdateRevenueCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  linkedQuickBooksAccountId?: string | null;
}

class CreateOtherRevenueDto {
  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  paymentMethod: string;

  @IsDateString()
  date: string;
}

@Controller('finance')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard, RolesGuard)
@RequireModule('finance')
@Roles('MANAGER', 'ADMIN', 'OWNER', 'FINANCE')
export class OtherRevenueController {
  constructor(private other: OtherRevenueService) {}

  @Get('revenue-categories')
  async listCategories(@CurrentUser('businessId') companyId: string) {
    return this.other.listCategories(companyId);
  }

  @Post('revenue-categories')
  async createCategory(@CurrentUser('businessId') companyId: string, @Body() dto: CreateRevenueCategoryDto) {
    return this.other.createCategory(companyId, dto.name, dto.linkedQuickBooksAccountId);
  }

  @Put('revenue-categories/:id')
  async updateCategory(
    @CurrentUser('businessId') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRevenueCategoryDto,
  ) {
    return this.other.updateCategory(companyId, id, { name: dto.name, linkedQuickBooksAccountId: dto.linkedQuickBooksAccountId ?? undefined });
  }

  @Delete('revenue-categories/:id')
  async deleteCategory(
    @CurrentUser('businessId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.other.deleteCategory(companyId, id);
  }

  @Get('other-revenues')
  async listOther(
    @CurrentUser('businessId') companyId: string,
    @Query('bookingId') bookingId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    return this.other.listOtherRevenue(companyId, {
      bookingId: String(bookingId ?? '').trim() || undefined,
      from: from ? startOfDay(new Date(from)) : undefined,
      to: to ? endOfDay(new Date(to)) : undefined,
    });
  }

  @Get('bookings/lookup')
  async lookupBookings(
    @CurrentUser('businessId') companyId: string,
    @Query('q') q?: string,
  ) {
    return this.other.lookupBookings(companyId, q);
  }

  @Post('other-revenues')
  async createOther(@CurrentUser() user: any, @Body() dto: CreateOtherRevenueDto) {
    return this.other.addOtherRevenue(user.businessId, {
      bookingId: dto.bookingId ?? null,
      categoryId: dto.categoryId,
      description: dto.description,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      date: new Date(dto.date),
      createdBy: user.sub,
    });
  }
}


import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

function normalizeSector(raw: unknown) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toUpperCase();
}

class CreateWorkerDto {
  @IsString()
  name: string;
  @IsString()
  @Transform(({ value }) => normalizeSector(value))
  sector: string; // dynamic, tenant-specific
  @IsString()
  role: string;
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsNumber()
  @Min(0)
  monthlySalary: number;
}

class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === undefined || value === null ? value : normalizeSector(value)))
  sector?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsNumber()
  @Min(0)
  monthlySalary?: number;
}

class MarkPaidDto {
  @IsString()
  workerId: string;
  @IsNumber()
  month: number;
  @IsNumber()
  year: number;
}

@Controller('workers')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard, RolesGuard)
@RequireModule('workers')
@Roles('MANAGER', 'ADMIN', 'OWNER')
export class WorkersController {
  constructor(private workers: WorkersService) {}

  @Get()
  async getWorkers(
    @CurrentUser() user: any,
    @Query('sector') sector?: string,
  ) {
    const branchId = user.branchId || 'main';
    return this.workers.getWorkers(user.businessId, branchId, sector);
  }

  @Post()
  async createWorker(@CurrentUser() user: any, @Body() dto: CreateWorkerDto) {
    const branchId = user.branchId || 'main';
    return this.workers.createWorker(
      user.businessId,
      branchId,
      dto,
      user.sub,
    );
  }

  @Put(':id')
  async updateWorker(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateWorkerDto,
  ) {
    const branchId = user.branchId || 'main';
    return this.workers.updateWorker(user.businessId, branchId, id, dto);
  }

  @Delete(':id')
  async deleteWorker(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const branchId = user.branchId || 'main';
    return this.workers.deleteWorker(user.businessId, branchId, id);
  }

  @Get('payroll')
  async getPayroll(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.workers.getPayroll(
      user.businessId,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  @Post('payroll/mark-paid')
  async markPaid(@CurrentUser() user: any, @Body() dto: MarkPaidDto) {
    return this.workers.markPaid(
      user.businessId,
      dto.workerId,
      dto.month,
      dto.year,
      user.sub,
    );
  }
}

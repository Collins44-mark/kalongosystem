import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { IsIn, IsNumber, IsString, Min } from 'class-validator';

class CreateWorkerDto {
  @IsString()
  name: string;
  @IsString()
  @IsIn(['FRONT_OFFICE', 'BAR', 'RESTAURANT', 'KITCHEN', 'HOUSEKEEPING', 'FINANCE'])
  sector: string;
  @IsString()
  role: string;
  @IsNumber()
  @Min(0)
  monthlySalary: number;
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
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
@UseGuards(RolesGuard)
@RequireModule('workers')
@Roles('MANAGER', 'ADMIN', 'OWNER')
export class WorkersController {
  constructor(private workers: WorkersService) {}

  @Get()
  async getWorkers(
    @CurrentUser() user: any,
    @Query('sector') sector?: string,
  ) {
    return this.workers.getWorkers(user.businessId, user.branchId, sector);
  }

  @Post()
  async createWorker(@CurrentUser() user: any, @Body() dto: CreateWorkerDto) {
    return this.workers.createWorker(
      user.businessId,
      user.branchId,
      dto,
      user.sub,
    );
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

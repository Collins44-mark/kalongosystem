import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { HousekeepingService } from './housekeeping.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AllowManagerGuard } from '../common/guards/allow-manager.guard';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

class UpdateRoomDto {
  @IsString()
  @IsIn(['VACANT', 'OCCUPIED', 'RESERVED', 'UNDER_MAINTENANCE'])
  status: string;
}

class SubmitRequestDto {
  @IsString()
  @IsOptional()
  roomId?: string;
  @IsString()
  description: string;
  @IsString()
  @IsIn(['MAINTENANCE', 'EXPENSE_REQUEST'])
  type: string;
  @IsNumber()
  @IsOptional()
  amount?: number;
}

class CreateLaundryDto {
  @IsString()
  @IsOptional()
  roomNumber?: string;
  @IsString()
  item: string;
  @IsNumber()
  @IsOptional()
  quantity?: number;
}

@Controller('housekeeping')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
@RequireModule('housekeeping')
export class HousekeepingController {
  constructor(private housekeeping: HousekeepingService) {}

  @Get('rooms')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING', 'FRONT_OFFICE')
  async getRooms(@CurrentUser() user: any) {
    return this.housekeeping.getRooms(user.businessId, user.branchId);
  }

  @Post('rooms/:id/mark-cleaned')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING')
  async markAsCleaned(@CurrentUser() user: any, @Param('id') roomId: string) {
    return this.housekeeping.markAsCleaned(user.businessId, user.branchId, roomId, {
      userId: user.sub,
      workerId: user.workerId ?? null,
      workerName: user.workerName ?? null,
    });
  }

  @Get('cleaning-logs')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING', 'FRONT_OFFICE')
  async getCleaningLogs(@CurrentUser() user: any) {
    return this.housekeeping.getCleaningLogs(user.businessId, user.branchId);
  }

  @Put('rooms/:id/status')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async updateRoomStatus(
    @CurrentUser() user: any,
    @Param('id') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.housekeeping.updateRoomStatus(
      user.businessId,
      roomId,
      dto.status,
      {
        userId: user.sub,
        role: user.role,
        workerId: user.workerId ?? null,
        workerName: user.workerName ?? null,
      },
    );
  }

  @Post('requests')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING')
  async submitRequest(@CurrentUser() user: any, @Body() dto: SubmitRequestDto) {
    return this.housekeeping.submitRequest(
      user.businessId,
      user.branchId,
      dto,
      user.sub,
    );
  }

  @Get('requests')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING')
  async getRequests(@CurrentUser() user: any) {
    return this.housekeeping.getRequests(user.businessId, user.branchId);
  }

  @Post('requests/:id/approve')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.housekeeping.approveRequest(user.businessId, id);
  }

  @Post('requests/:id/reject')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async reject(@CurrentUser() user: any, @Param('id') id: string) {
    return this.housekeeping.rejectRequest(user.businessId, id);
  }

  @Get('laundry')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING')
  async getLaundry(@CurrentUser() user: any) {
    return this.housekeeping.getLaundryRequests(user.businessId, user.branchId);
  }

  @Post('laundry')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING')
  async createLaundry(@CurrentUser() user: any, @Body() dto: CreateLaundryDto) {
    return this.housekeeping.createLaundryRequest(
      user.businessId,
      user.branchId,
      { roomNumber: dto.roomNumber, item: dto.item, quantity: dto.quantity ?? 1 },
      { workerId: user.workerId ?? null, workerName: user.workerName ?? null },
    );
  }

  @Post('laundry/:id/delivered')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING')
  async markLaundryDelivered(@CurrentUser() user: any, @Param('id') id: string) {
    return this.housekeeping.markLaundryDelivered(user.businessId, id);
  }
}

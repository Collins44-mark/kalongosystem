import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { HousekeepingService } from './housekeeping.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
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

  @Put('rooms/:id/status')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'HOUSEKEEPING')
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
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  async approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.housekeeping.approveRequest(user.businessId, id);
  }

  @Post('requests/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  async reject(@CurrentUser() user: any, @Param('id') id: string) {
    return this.housekeeping.rejectRequest(user.businessId, id);
  }
}

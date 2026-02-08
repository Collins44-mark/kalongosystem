import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowManagerGuard } from '../common/guards/allow-manager.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StaffWorkersService } from './staff-workers.service';

@Controller('api/staff-workers')
@UseGuards(JwtAuthGuard)
export class StaffWorkersController {
  constructor(private staffWorkers: StaffWorkersService) {}

  @Get()
  @UseGuards(AllowManagerGuard)
  async list(
    @CurrentUser() user: { businessId: string; role: string },
    @Query('role') role?: string,
  ) {
    return this.staffWorkers.list(user.businessId, role);
  }

  @Post()
  @UseGuards(AllowManagerGuard)
  async create(
    @CurrentUser() user: { sub: string; businessId: string; role: string },
    @Body() dto: { fullName: string; role: string },
  ) {
    return this.staffWorkers.create(user.businessId, dto, user.sub, user.role || 'MANAGER');
  }

  @Patch(':id')
  @UseGuards(AllowManagerGuard)
  async update(
    @CurrentUser() user: { sub: string; businessId: string; role: string },
    @Param('id') id: string,
    @Body() dto: { fullName?: string; role?: string },
  ) {
    return this.staffWorkers.update(user.businessId, id, user.sub, user.role || 'MANAGER', dto);
  }

  @Patch(':id/block')
  @UseGuards(AllowManagerGuard)
  async block(
    @CurrentUser() user: { sub: string; businessId: string; role: string },
    @Param('id') id: string,
    @Body('blocked') blocked: boolean,
  ) {
    return this.staffWorkers.setStatus(
      user.businessId,
      id,
      blocked ? 'BLOCKED' : 'ACTIVE',
      user.sub,
      user.role || 'MANAGER',
    );
  }

  @Patch(':id/role')
  @UseGuards(AllowManagerGuard)
  async moveRole(
    @CurrentUser() user: { sub: string; businessId: string; role: string },
    @Param('id') id: string,
    @Body('role') newRole: string,
  ) {
    return this.staffWorkers.moveRole(user.businessId, id, newRole, user.sub, user.role || 'MANAGER');
  }

  @Delete(':id')
  @UseGuards(AllowManagerGuard)
  async delete(
    @CurrentUser() user: { sub: string; businessId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.staffWorkers.delete(user.businessId, id, user.sub, user.role || 'MANAGER');
  }

  @Get('activity')
  @UseGuards(AllowManagerGuard)
  async activity(
    @CurrentUser() user: { businessId: string },
    @Query('workerId') workerId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.staffWorkers.getActivityLogs(user.businessId, workerId, limit ? parseInt(limit, 10) : 100);
  }
}

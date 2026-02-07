import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OverviewService } from './overview.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('overview')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@UseGuards(RolesGuard)
@Roles('MANAGER', 'ADMIN', 'OWNER')
export class OverviewController {
  constructor(private overview: OverviewService) {}

  @Get()
  async getDashboard(
    @CurrentUser() user: any,
    @Query('period') period: 'today' | 'week' | 'month' = 'today',
  ) {
    return this.overview.getDashboard(
      user.businessId,
      user.branchId,
      period,
    );
  }
}

import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AllowManagerGuard } from '../common/guards/allow-manager.guard';

@Controller('api/notifications')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async getAlerts(@CurrentUser() user: any) {
    return this.notifications.getAlertsForAdmin(user.businessId, user.sub);
  }

  @Get('unread-count')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async getUnreadCount(@CurrentUser() user: any) {
    const count = await this.notifications.getUnreadCount(user.businessId, user.sub);
    return { unread: count };
  }

  @Post('mark-read')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async markAllAsRead(@CurrentUser() user: any) {
    await this.notifications.markAllAsRead(user.businessId, user.sub);
    return { ok: true };
  }
}

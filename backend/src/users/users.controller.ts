import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { AllowManagerGuard } from '../common/guards/allow-manager.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, SubscriptionGuard, AllowManagerGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    return this.users.listUsers(user.businessId, user.sub);
  }

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body() dto: { fullName: string; role: string },
  ) {
    return this.users.createUser(user.businessId, user.sub, user.role || 'MANAGER', dto);
  }

  @Post(':id/reset-password')
  async resetPassword(@CurrentUser() user: any, @Param('id') id: string) {
    return this.users.resetPassword(user.businessId, id, user.sub, user.role || 'MANAGER');
  }

  @Patch(':id/disable')
  async disable(@CurrentUser() user: any, @Param('id') id: string, @Body('disabled') disabled: boolean) {
    return this.users.setDisabled(user.businessId, id, disabled === true, user.sub, user.role || 'MANAGER');
  }
}

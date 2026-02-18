import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsString } from 'class-validator';

class SendMessageDto {
  @IsString()
  recipientRole: string;
  @IsString()
  body: string;
}

@Controller('messages')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
@RequireModule('messages')
export class MessagesController {
  constructor(private messages: MessagesService) {}

  @Post()
  async send(
    @CurrentUser() user: { sub: string; businessId: string; role: string },
    @Body() dto: SendMessageDto,
  ) {
    const role = ['ADMIN', 'OWNER'].includes(user.role || '') ? 'MANAGER' : user.role;
    return this.messages.send(
      user.businessId,
      user.sub,
      role,
      dto.recipientRole?.trim() || 'MANAGER',
      dto.body,
    );
  }

  @Get()
  async list(
    @CurrentUser() user: { businessId: string },
    @Query('period') period?: 'day' | 'week' | 'month' | 'bydate',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('recipientRole') recipientRole?: string,
    @Query('senderRole') senderRole?: string,
  ) {
    return this.messages.list(user.businessId, {
      period: period || 'day',
      from,
      to,
      recipientRole,
      senderRole,
    });
  }
}

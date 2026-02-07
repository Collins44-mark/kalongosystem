import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BarService } from './bar.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

class OrderItemDto {
  @IsString()
  barItemId: string;
  @IsNumber()
  @Min(1)
  quantity: number;
}

class CreateOrderDto {
  @IsArray()
  items: OrderItemDto[];
  @IsString()
  @IsIn(['CASH', 'MOBILE_MONEY', 'BANK'])
  paymentMethod: string;
}

class CreateItemDto {
  @IsString()
  name: string;
  @IsNumber()
  @Min(0)
  price: number;
}

@Controller('bar')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class BarController {
  constructor(private bar: BarService) {}

  /** Bar staff: list items (read-only prices) */
  @Get('items')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'BAR')
  async getItems(@CurrentUser() user: any) {
    return this.bar.getItems(user.businessId, user.branchId);
  }

  /** Bar staff: create order - NO totals shown in response for staff, but we return minimal confirmation */
  @Post('orders')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'BAR')
  async createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    const order = await this.bar.createOrder(
      user.businessId,
      user.branchId,
      dto.items,
      dto.paymentMethod,
      user.sub,
    );
    return { orderId: order.id, orderNumber: order.orderNumber, message: 'Order confirmed' };
  }

  /** Manager only: create bar item */
  @Post('items')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  async createItem(@CurrentUser() user: any, @Body() dto: CreateItemDto) {
    return this.bar.createItem(
      user.businessId,
      user.branchId,
      dto,
      user.sub,
    );
  }
}

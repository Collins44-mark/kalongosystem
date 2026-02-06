import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { IsArray, IsIn, IsNumber, IsString, Min } from 'class-validator';

class OrderItemDto {
  @IsString()
  restaurantItemId: string;
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

@Controller('restaurant')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class RestaurantController {
  constructor(private restaurant: RestaurantService) {}

  @Get('items')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESTAURANT', 'KITCHEN')
  async getItems(@CurrentUser() user: any) {
    return this.restaurant.getItems(user.businessId, user.branchId);
  }

  @Post('orders')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESTAURANT', 'KITCHEN')
  async createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    const order = await this.restaurant.createOrder(
      user.businessId,
      user.branchId,
      dto.items,
      dto.paymentMethod,
      user.sub,
    );
    return { orderId: order.id, orderNumber: order.orderNumber, message: 'Order confirmed' };
  }

  @Post('items')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async createItem(@CurrentUser() user: any, @Body() dto: CreateItemDto) {
    return this.restaurant.createItem(
      user.businessId,
      user.branchId,
      dto,
      user.sub,
    );
  }

  @Get('orders')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async getOrders(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.restaurant.getOrders(
      user.businessId,
      user.branchId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('sales')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async getSales(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.restaurant.getSalesTotal(
      user.businessId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }
}

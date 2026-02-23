import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AllowManagerGuard } from '../common/guards/allow-manager.guard';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
  @IsIn(['CASH', 'BANK', 'MOBILE_MONEY'])
  paymentMethod: string;
  @IsOptional()
  @IsString()
  customerName?: string;
}

class CreateItemDto {
  @IsString()
  name: string;
  @IsNumber()
  @Min(0)
  price: number;
  @IsOptional()
  @IsString()
  category?: string;
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

@Controller('restaurant')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
@RequireModule('restaurant')
export class RestaurantController {
  constructor(private restaurant: RestaurantService) {}

  @Get('items')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'RESTAURANT', 'KITCHEN')
  async getItems(@CurrentUser() user: any) {
    const includeDisabled = user.role === 'MANAGER';
    return this.restaurant.getItems(user.businessId, user.branchId, includeDisabled);
  }

  @Post('orders')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'RESTAURANT', 'KITCHEN')
  async createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    const order = await this.restaurant.createOrder(
      user.businessId,
      user.branchId,
      dto.items,
      dto.paymentMethod,
      dto.customerName,
      { userId: user.sub, role: user.role, workerId: user.workerId, workerName: user.workerName },
    );
    return { orderId: order.id, orderNumber: order.orderNumber, message: 'Order confirmed' };
  }

  /** Order history (no totals) - visible to RESTAURANT staff and MANAGER */
  @Get('orders/history')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'RESTAURANT', 'KITCHEN')
  async history(
    @CurrentUser() user: any,
    @Query('period') period?: 'today' | 'week' | 'month' | 'bydate',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('workerId') workerId?: string,
    @Query('paymentMethod') paymentMethod?: string,
  ) {
    const p = (period || 'today') as string;
    const now = new Date();
    const range = (() => {
      if (p === 'week') {
        const end = new Date(now);
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        return { from: start, to: end };
      }
      if (p === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now);
        return { from: start, to: end };
      }
      if (p === 'bydate' && from && to) {
        const start = new Date(`${from}T00:00:00.000Z`);
        const end = new Date(`${to}T23:59:59.999Z`);
        return { from: start, to: end };
      }
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    })();

    // Manager can filter by worker/payment; staff cannot.
    const opts =
      user.role === 'MANAGER'
        ? { from: range.from, to: range.to, workerId, paymentMethod }
        : { from: range.from, to: range.to };

    const orders = await this.restaurant.getOrders(user.businessId, user.branchId, opts);
    return orders.map((o: any) => ({
      id: o.id,
      createdAt: o.createdAt,
      paymentMethod: o.paymentMethod,
      servedBy: o.createdByWorkerName ?? null,
      items: (o.items || []).map((it: any) => ({
        id: it.id,
        name: it.restaurantItem?.name,
        quantity: it.quantity,
      })),
    }));
  }

  /** Menu management (MANAGER only) */
  @Post('items')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async createItem(@CurrentUser() user: any, @Body() dto: CreateItemDto) {
    return this.restaurant.createItem(
      user.businessId,
      user.branchId,
      dto,
      { userId: user.sub, role: user.role || 'MANAGER' },
    );
  }

  @Patch('items/:id')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async updateItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: Partial<CreateItemDto>,
  ) {
    return this.restaurant.updateItem(
      user.businessId,
      user.branchId,
      id,
      dto as any,
      { userId: user.sub, role: user.role || 'MANAGER' },
    );
  }
}

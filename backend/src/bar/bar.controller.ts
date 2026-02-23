import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BarService } from './bar.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AllowManagerGuard } from '../common/guards/allow-manager.guard';
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
  @IsNumber()
  @Min(0)
  quantity: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;
}

class RestockItemDto {
  @IsString()
  barItemId: string;
  @IsNumber()
  @Min(1)
  quantityAdded: number;
}

class CreateRestockDto {
  @IsArray()
  items: RestockItemDto[];
}

@Controller('bar')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
@RequireModule('bar')
export class BarController {
  constructor(private bar: BarService) {}

  private getRangeFromQuery(period?: string, from?: string, to?: string) {
    const p = (period || 'today') as string;
    const now = new Date();
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
  }

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
      dto.customerName,
      { userId: user.sub, role: user.role, workerId: user.workerId, workerName: user.workerName },
    );
    return { orderId: order.id, orderNumber: order.orderNumber, message: 'Order confirmed' };
  }

  /** Create bar item: MANAGER always; BAR only when permitted */
  @Post('items')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'BAR')
  async createItem(@CurrentUser() user: any, @Body() dto: CreateItemDto) {
    return this.bar.createItem(
      user.businessId,
      user.branchId,
      dto,
      { userId: user.sub, role: user.role, workerId: user.workerId, workerName: user.workerName },
    );
  }

  /** BAR + MANAGER: see if restock is enabled for BAR role */
  @Get('restock-permission')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'BAR')
  async getRestockPermission(@CurrentUser() user: any) {
    return this.bar.getRestockPermission(user.businessId);
  }

  /** MANAGER: enable/disable restock permission (optional session expiry) */
  @Patch('restock-permission')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async setRestockPermission(
    @CurrentUser() user: any,
    @Body('enabled') enabled: boolean,
    @Body('expiresMinutes') expiresMinutes?: number,
  ) {
    return this.bar.setRestockPermission(
      user.businessId,
      enabled === true,
      { userId: user.sub, role: user.role || 'MANAGER', workerId: user.workerId, workerName: user.workerName },
      typeof expiresMinutes === 'number' ? expiresMinutes : null,
    );
  }

  /** BAR + MANAGER: see if add-item is enabled for BAR role */
  @Get('add-item-permission')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'BAR')
  async getAddItemPermission(@CurrentUser() user: any) {
    return this.bar.getAddItemPermission(user.businessId);
  }

  /** MANAGER: enable/disable add-item permission (optional session expiry) */
  @Patch('add-item-permission')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async setAddItemPermission(
    @CurrentUser() user: any,
    @Body('enabled') enabled: boolean,
    @Body('expiresMinutes') expiresMinutes?: number,
  ) {
    return this.bar.setAddItemPermission(
      user.businessId,
      enabled === true,
      { userId: user.sub, role: user.role || 'MANAGER', workerId: user.workerId, workerName: user.workerName },
      typeof expiresMinutes === 'number' ? expiresMinutes : null,
    );
  }

  /** BAR: create restock only when enabled. MANAGER always allowed. */
  @Post('restocks')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'BAR')
  async createRestock(@CurrentUser() user: any, @Body() dto: CreateRestockDto) {
    return this.bar.createRestock(
      user.businessId,
      user.branchId,
      { userId: user.sub, role: user.role, workerId: user.workerId, workerName: user.workerName },
      dto.items,
    );
  }

  /** BAR: order history for the active worker */
  @Get('orders/my')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'BAR')
  async myOrders(
    @CurrentUser() user: any,
    @Query('period') period?: 'today' | 'week' | 'month' | 'bydate',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = this.getRangeFromQuery(period, from, to);

    const orders = await this.bar.listMyOrders(
      user.businessId,
      user.branchId,
      { userId: user.sub, role: user.role, workerId: user.workerId, workerName: user.workerName },
      range.from,
      range.to,
    );
    // For BAR, return minimal fields (no aggregates across all sales).
    if (user.role === 'BAR') {
      return orders.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
        createdByWorkerName: o.createdByWorkerName ?? null,
        items: (o.items || []).map((it: any) => ({ id: it.id, quantity: it.quantity, name: it.barItem?.name })),
      }));
    }
    return orders;
  }

  /** MANAGER: bar order history */
  @Get('orders')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async listOrders(
    @CurrentUser() user: any,
    @Query('period') period?: 'today' | 'week' | 'month' | 'bydate',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = this.getRangeFromQuery(period, from, to);
    return this.bar.getOrders(user.businessId, user.branchId, range.from, range.to);
  }

  /** MANAGER: restock history */
  @Get('restocks')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async listRestocks(@CurrentUser() user: any) {
    return this.bar.listRestocks(user.businessId, user.branchId);
  }

  /** MANAGER: restock detail */
  @Get('restocks/:id')
  @UseGuards(RolesGuard, AllowManagerGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async getRestock(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bar.getRestock(user.businessId, id);
  }
}

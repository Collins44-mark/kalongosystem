import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { BarService } from './bar.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
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

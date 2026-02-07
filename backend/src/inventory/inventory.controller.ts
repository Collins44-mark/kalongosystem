import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

class CreateItemDto {
  @IsString()
  name: string;
  @IsNumber()
  @IsOptional()
  @Min(0)
  quantity?: number;
  @IsNumber()
  @IsOptional()
  @Min(0)
  minQuantity?: number;
  @IsNumber()
  @IsOptional()
  @Min(0)
  unitPrice?: number;
}

class RestockDto {
  @IsString()
  inventoryItemId: string;
  @IsNumber()
  @Min(1)
  quantityAdded: number;
}

@Controller('inventory')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@UseGuards(RolesGuard)
@Roles('MANAGER')
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get('items')
  async getItems(@CurrentUser() user: any) {
    return this.inventory.getItems(user.businessId, user.branchId);
  }

  @Post('items')
  async createItem(@CurrentUser() user: any, @Body() dto: CreateItemDto) {
    return this.inventory.createItem(
      user.businessId,
      user.branchId,
      dto,
      user.sub,
    );
  }

  @Get('low-stock')
  async getLowStock(@CurrentUser() user: any) {
    return this.inventory.getLowStock(user.businessId, user.branchId);
  }

  @Get('value-at-risk')
  async getValueAtRisk(@CurrentUser() user: any) {
    return this.inventory.getTotalValueAtRisk(user.businessId, user.branchId);
  }

  @Get('estimated-value')
  async getEstimatedValue(@CurrentUser() user: any) {
    return this.inventory.getEstimatedStockValue(user.businessId, user.branchId);
  }

  @Post('restock')
  async restock(@CurrentUser() user: any, @Body() dto: RestockDto) {
    return this.inventory.restock(
      user.businessId,
      user.branchId,
      dto.inventoryItemId,
      dto.quantityAdded,
      user.sub,
    );
  }

  @Get('restock-history')
  async getRestockHistory(@CurrentUser() user: any) {
    return this.inventory.getRestockHistory(user.businessId, user.branchId);
  }
}

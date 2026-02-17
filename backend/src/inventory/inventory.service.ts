import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getItems(businessId: string, branchId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { businessId, branchId },
      orderBy: { name: 'asc' },
    });
  }

  async createItem(
    businessId: string,
    branchId: string,
    data: { name: string; quantity?: number; minQuantity?: number; unitPrice?: number },
    createdBy: string,
  ) {
    return this.prisma.inventoryItem.create({
      data: {
        businessId,
        branchId,
        name: data.name,
        quantity: data.quantity ?? 0,
        minQuantity: data.minQuantity ?? 5,
        unitPrice: new Decimal(data.unitPrice ?? 0),
        createdBy,
      },
    });
  }

  async getLowStock(businessId: string, branchId: string) {
    const bid = branchId || 'main';
    const items = await this.prisma.inventoryItem.findMany({
      where: { businessId, branchId: bid },
    });
    return items.filter((i) => i.quantity <= i.minQuantity);
  }

  async getTotalValueAtRisk(businessId: string, branchId: string) {
    const low = await this.getLowStock(businessId, branchId || 'main');
    let value = 0;
    for (const i of low) {
      value += Number(i.unitPrice) * i.quantity;
    }
    return value;
  }

  async getEstimatedStockValue(businessId: string, branchId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { businessId, branchId },
    });
    return items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
  }

  /** Restock - requires admin to enable. Immutable history. */
  async restock(
    businessId: string,
    branchId: string,
    inventoryItemId: string,
    quantityAdded: number,
    createdBy: string,
  ) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, businessId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    const oldQty = item.quantity;
    const newQty = oldQty + quantityAdded;

    await this.prisma.inventoryRestock.create({
      data: {
        businessId,
        branchId,
        inventoryItemId,
        quantityAdded,
        oldQuantity: oldQty,
        newQuantity: newQty,
        createdBy,
      },
    });

    await this.prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { quantity: newQty },
    });

    return { oldQuantity: oldQty, newQuantity: newQty };
  }

  async getRestockHistory(businessId: string, branchId: string) {
    return this.prisma.inventoryRestock.findMany({
      where: { businessId, branchId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

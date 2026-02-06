import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BarService {
  constructor(private prisma: PrismaService) {}

  async getItems(businessId: string, branchId: string) {
    return this.prisma.barItem.findMany({
      where: { businessId, branchId },
      orderBy: { name: 'asc' },
    });
  }

  /** Admin only - create bar item */
  async createItem(
    businessId: string,
    branchId: string,
    data: { name: string; price: number },
    createdBy: string,
  ) {
    return this.prisma.barItem.create({
      data: {
        businessId,
        branchId,
        name: data.name,
        price: new Decimal(data.price),
        createdBy,
      },
    });
  }

  /** Bar staff: create order - auto creates sale, decreases inventory */
  async createOrder(
    businessId: string,
    branchId: string,
    items: { barItemId: string; quantity: number }[],
    paymentMethod: string,
    createdById: string,
  ) {
    let total = 0;
    const orderItems: { barItemId: string; quantity: number; unitPrice: number; totalPrice: number }[] = [];

    for (const it of items) {
      const item = await this.prisma.barItem.findFirst({
        where: { id: it.barItemId, businessId },
      });
      if (!item) throw new NotFoundException(`Bar item ${it.barItemId} not found`);
      const unitPrice = Number(item.price);
      const totalPrice = unitPrice * it.quantity;
      total += totalPrice;
      orderItems.push({
        barItemId: item.id,
        quantity: it.quantity,
        unitPrice,
        totalPrice,
      });
    }

    const orderNumber = `BAR-${Date.now()}`;
    const order = await this.prisma.barOrder.create({
      data: {
        businessId,
        branchId,
        orderNumber,
        paymentMethod,
        totalAmount: new Decimal(total),
        createdById,
        items: {
          create: orderItems.map((o) => ({
            barItemId: o.barItemId,
            quantity: o.quantity,
            unitPrice: new Decimal(o.unitPrice),
            totalPrice: new Decimal(o.totalPrice),
          })),
        },
      },
      include: { items: { include: { barItem: true } } },
    });

    // Decrease inventory if bar item has linked inventory
    for (const it of orderItems) {
      const barItem = await this.prisma.barItem.findUnique({
        where: { id: it.barItemId },
      });
      if (barItem?.inventoryItemId) {
        await this.prisma.inventoryItem.update({
          where: { id: barItem.inventoryItemId },
          data: { quantity: { decrement: it.quantity } },
        });
      }
    }

    return order;
  }

  /** Admin only - get sales */
  async getOrders(businessId: string, branchId: string, from?: Date, to?: Date) {
    const where: any = { businessId, branchId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    return this.prisma.barOrder.findMany({
      where,
      include: { items: { include: { barItem: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSalesTotal(businessId: string, from?: Date, to?: Date) {
    const where: any = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    const result = await this.prisma.barOrder.aggregate({
      where,
      _sum: { totalAmount: true },
      _count: true,
    });
    return {
      total: Number(result._sum.totalAmount || 0),
      count: result._count,
    };
  }
}

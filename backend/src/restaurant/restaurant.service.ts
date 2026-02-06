import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class RestaurantService {
  constructor(private prisma: PrismaService) {}

  async getItems(businessId: string, branchId: string) {
    return this.prisma.restaurantItem.findMany({
      where: { businessId, branchId },
      orderBy: { name: 'asc' },
    });
  }

  async createItem(
    businessId: string,
    branchId: string,
    data: { name: string; price: number },
    createdBy: string,
  ) {
    return this.prisma.restaurantItem.create({
      data: {
        businessId,
        branchId,
        name: data.name,
        price: new Decimal(data.price),
        createdBy,
      },
    });
  }

  async createOrder(
    businessId: string,
    branchId: string,
    items: { restaurantItemId: string; quantity: number }[],
    paymentMethod: string,
    createdById: string,
  ) {
    let total = 0;
    const orderItems: { restaurantItemId: string; quantity: number; unitPrice: number; totalPrice: number }[] = [];

    for (const it of items) {
      const item = await this.prisma.restaurantItem.findFirst({
        where: { id: it.restaurantItemId, businessId },
      });
      if (!item) throw new NotFoundException(`Restaurant item ${it.restaurantItemId} not found`);
      const unitPrice = Number(item.price);
      const totalPrice = unitPrice * it.quantity;
      total += totalPrice;
      orderItems.push({
        restaurantItemId: item.id,
        quantity: it.quantity,
        unitPrice,
        totalPrice,
      });
    }

    const orderNumber = `REST-${Date.now()}`;
    const order = await this.prisma.restaurantOrder.create({
      data: {
        businessId,
        branchId,
        orderNumber,
        paymentMethod,
        totalAmount: new Decimal(total),
        createdById,
        items: {
          create: orderItems.map((o) => ({
            restaurantItemId: o.restaurantItemId,
            quantity: o.quantity,
            unitPrice: new Decimal(o.unitPrice),
            totalPrice: new Decimal(o.totalPrice),
          })),
        },
      },
      include: { items: { include: { restaurantItem: true } } },
    });

    for (const it of orderItems) {
      const restItem = await this.prisma.restaurantItem.findUnique({
        where: { id: it.restaurantItemId },
      });
      if (restItem?.inventoryItemId) {
        await this.prisma.inventoryItem.update({
          where: { id: restItem.inventoryItemId },
          data: { quantity: { decrement: it.quantity } },
        });
      }
    }

    return order;
  }

  async getOrders(businessId: string, branchId: string, from?: Date, to?: Date) {
    const where: any = { businessId, branchId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    return this.prisma.restaurantOrder.findMany({
      where,
      include: { items: { include: { restaurantItem: true } } },
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
    const result = await this.prisma.restaurantOrder.aggregate({
      where,
      _sum: { totalAmount: true },
      _count: true,
    });
    return { total: Number(result._sum.totalAmount || 0), count: result._count };
  }
}

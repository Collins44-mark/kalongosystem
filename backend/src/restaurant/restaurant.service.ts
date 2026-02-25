import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class RestaurantService {
  constructor(private prisma: PrismaService) {}

  private async logAudit(
    businessId: string,
    actor: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: object,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          businessId,
          userId: actor.userId,
          role: actor.role,
          workerId: actor.workerId ?? null,
          workerName: actor.workerName ?? null,
          actionType,
          entityType,
          entityId,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
    } catch {
      /* non-fatal */
    }
  }

  async getItems(businessId: string, branchId: string, includeDisabled = false) {
    return this.prisma.restaurantItem.findMany({
      where: { businessId, branchId, ...(includeDisabled ? {} : { isEnabled: true }) },
      orderBy: { name: 'asc' },
    });
  }

  async getCanAddMenuItems(businessId: string): Promise<boolean> {
    const s = await this.prisma.businessSetting.findFirst({
      where: { businessId, key: 'restaurant_canAddMenuItems' },
    });
    return s?.value === 'true';
  }

  async createItem(
    businessId: string,
    branchId: string,
    data: { name: string; price: number; category?: string | null; isEnabled?: boolean },
    createdBy: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
  ) {
    const isManager = ['MANAGER', 'ADMIN', 'OWNER'].includes(createdBy.role || '');
    if (!isManager) {
      const canAdd = await this.getCanAddMenuItems(businessId);
      if (!canAdd) throw new ForbiddenException('Restaurant role cannot add menu items');
    }
    const item = await this.prisma.restaurantItem.create({
      data: {
        businessId,
        branchId,
        name: data.name.trim(),
        price: new Decimal(data.price),
        category: data.category ? data.category.trim() : null,
        isEnabled: data.isEnabled ?? true,
        createdBy: createdBy.userId,
      },
    });
    await this.logAudit(businessId, createdBy, 'restaurant_item_created', 'restaurant_item', item.id, {
      name: item.name,
      category: item.category,
      isEnabled: item.isEnabled,
    });
    return item;
  }

  async updateItem(
    businessId: string,
    branchId: string,
    itemId: string,
    data: { name?: string; price?: number; category?: string | null; isEnabled?: boolean },
    actor: { userId: string; role: string },
  ) {
    const isManager = ['MANAGER', 'ADMIN', 'OWNER'].includes(actor.role || '');
    if (!isManager) throw new ForbiddenException('Only Admin can edit or disable menu items');
    const existing = await this.prisma.restaurantItem.findFirst({ where: { id: itemId, businessId, branchId } });
    if (!existing) throw new NotFoundException('Item not found');
    const updated = await this.prisma.restaurantItem.update({
      where: { id: itemId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.price !== undefined ? { price: new Decimal(data.price) } : {}),
        ...(data.category !== undefined ? { category: data.category ? data.category.trim() : null } : {}),
        ...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {}),
      },
    });
    await this.logAudit(businessId, { userId: actor.userId, role: actor.role }, 'restaurant_item_updated', 'restaurant_item', itemId);
    return updated;
  }

  async createOrder(
    businessId: string,
    branchId: string,
    items: { restaurantItemId: string; quantity: number }[],
    paymentMethod: string,
    customerName: string | undefined,
    createdBy: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
  ) {
    // Enforce worker accountability for Restaurant staff
    if (createdBy.role === 'RESTAURANT' && (!createdBy.workerId || !createdBy.workerName)) {
      throw new ForbiddenException('Select worker before creating order');
    }

    let total = 0;
    const orderItems: { restaurantItemId: string; quantity: number; unitPrice: number; totalPrice: number }[] = [];

    for (const it of items) {
      const item = await this.prisma.restaurantItem.findFirst({
        where: { id: it.restaurantItemId, businessId, branchId, isEnabled: true },
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
    const customer = String(customerName ?? '').trim() || 'Restaurant Walk-in Customer';
    const pm = String(paymentMethod ?? '').trim();
    if (!pm) throw new BadRequestException('Payment method is required');
    const paymentModeUpper = pm.toUpperCase();
    if (!['CASH', 'BANK', 'MPESA', 'TIGOPESA', 'AIRTEL_MONEY'].includes(paymentModeUpper)) {
      throw new BadRequestException('Invalid payment method');
    }
    const order = await this.prisma.restaurantOrder.create({
      data: {
        businessId,
        branchId,
        orderNumber,
        paymentMethod: paymentModeUpper,
        customerName: customer,
        totalAmount: new Decimal(total),
        createdById: createdBy.userId,
        createdByRole: createdBy.role,
        createdByWorkerId: createdBy.workerId ?? null,
        createdByWorkerName: createdBy.workerName ?? null,
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

    await this.logAudit(businessId, createdBy, 'restaurant_order_created', 'restaurant_order', order.id, {
      orderNumber,
      paymentMethod,
      items: orderItems.map((i) => ({ restaurantItemId: i.restaurantItemId, quantity: i.quantity })),
    });

    return order;
  }

  async getOrders(
    businessId: string,
    branchId: string,
    opts: {
      from?: Date;
      to?: Date;
      workerId?: string;
      paymentMethod?: string;
    } = {},
  ) {
    const where: any = { businessId, branchId };
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = opts.from;
      if (opts.to) where.createdAt.lte = opts.to;
    }
    if (opts.workerId) where.createdByWorkerId = opts.workerId;
    if (opts.paymentMethod) where.paymentMethod = opts.paymentMethod;
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

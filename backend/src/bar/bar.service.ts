import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BarService {
  constructor(private prisma: PrismaService) {}

  async getItems(businessId: string, branchId: string) {
    const items = await this.prisma.barItem.findMany({
      where: { businessId, branchId },
      include: { },
      orderBy: { name: 'asc' },
    });

    const invIds = items.map((i) => i.inventoryItemId).filter(Boolean) as string[];
    const inv = invIds.length
      ? await this.prisma.inventoryItem.findMany({
          where: { id: { in: invIds } },
          select: { id: true, quantity: true, minQuantity: true },
        })
      : [];
    const invMap = new Map(inv.map((i) => [i.id, i]));

    return items.map((it) => {
      const ii = it.inventoryItemId ? invMap.get(it.inventoryItemId) : null;
      return {
        id: it.id,
        name: it.name,
        price: String(it.price),
        inventoryItemId: it.inventoryItemId,
        stock: ii ? ii.quantity : null,
        minQuantity: ii ? ii.minQuantity : null,
      };
    });
  }

  /** Low-stock bar items (for overview inventory alerts): quantity <= minQuantity on linked inventory */
  async getLowStock(businessId: string, branchId: string): Promise<{ id: string; name: string; quantity: number; minQuantity: number }[]> {
    const bid = branchId || 'main';
    const items = await this.prisma.barItem.findMany({
      where: { businessId, branchId: bid },
      select: { id: true, name: true, inventoryItemId: true },
    });
    
    // Get inventory items linked via inventoryItemId
    const invIds = items.map((i) => i.inventoryItemId).filter(Boolean) as string[];
    const invLinked = invIds.length > 0
      ? await this.prisma.inventoryItem.findMany({
          where: { id: { in: invIds }, businessId, branchId: bid },
          select: { id: true, quantity: true, minQuantity: true },
        })
      : [];
    const invLinkedMap = new Map(invLinked.map((i) => [i.id, i]));
    
    // Also check inventory items by name pattern "BAR:<barItemName>" for items without inventoryItemId
    const itemsWithoutLink = items.filter((i) => !i.inventoryItemId);
    const invByName = itemsWithoutLink.length > 0
      ? await this.prisma.inventoryItem.findMany({
          where: {
            businessId,
            branchId: bid,
            name: { in: itemsWithoutLink.map((i) => `BAR:${i.name}`) },
          },
          select: { id: true, name: true, quantity: true, minQuantity: true },
        })
      : [];
    const invByNameMap = new Map(invByName.map((i) => [i.name.replace(/^BAR:/, ''), i]));
    
    const low: { id: string; name: string; quantity: number; minQuantity: number }[] = [];
    
    // Check items with inventoryItemId
    for (const it of items) {
      if (!it.inventoryItemId) continue;
      const ii = invLinkedMap.get(it.inventoryItemId);
      if (!ii || ii.quantity > ii.minQuantity) continue;
      low.push({
        id: it.id,
        name: it.name,
        quantity: ii.quantity,
        minQuantity: ii.minQuantity,
      });
    }
    
    // Check items without inventoryItemId but with matching inventory by name
    for (const it of itemsWithoutLink) {
      const ii = invByNameMap.get(it.name);
      if (!ii || ii.quantity > ii.minQuantity) continue;
      low.push({
        id: it.id,
        name: it.name,
        quantity: ii.quantity,
        minQuantity: ii.minQuantity,
      });
    }
    
    return low;
  }

  // ==========================
  // Permissions (BAR)
  // Stored in business_settings:
  // - barRestockPermission (JSON)
  // - barAddItemPermission (JSON)
  // ==========================

  async createItem(
    businessId: string,
    branchId: string,
    data: { name: string; price: number; quantity: number; minQuantity?: number },
    createdBy: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
  ) {
    if (createdBy.role === 'BAR') {
      const perm = await this.getAddItemPermission(businessId);
      if (!perm.enabled) throw new ForbiddenException('Add item not permitted');
    }

    const name = data.name.trim();
    const qty = Number(data.quantity);
    if (!name) throw new BadRequestException('Name required');
    if (isNaN(qty) || qty < 0) throw new BadRequestException('Invalid quantity');

    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventoryItem.create({
        data: {
          businessId,
          branchId,
          name: `BAR:${name}`,
          quantity: qty,
          minQuantity: data.minQuantity ?? 5,
          unitPrice: new Decimal(0),
          createdBy: createdBy.userId,
        },
      });

      const item = await tx.barItem.create({
        data: {
          businessId,
          branchId,
          name,
          price: new Decimal(data.price),
          inventoryItemId: inv.id,
          createdBy: createdBy.userId,
        },
      });

      await this.logAudit(businessId, createdBy, 'bar_item_created', 'bar_item', item.id, {
        name,
        price: data.price,
        quantity: qty,
      });

      return item;
    });
  }

  /** Bar staff: create order - auto creates sale, decreases inventory */
  async createOrder(
    businessId: string,
    branchId: string,
    items: { barItemId: string; quantity: number }[],
    paymentMethod: string,
    createdBy: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
  ) {
    let total = 0;
    const orderItems: { barItemId: string; quantity: number; unitPrice: number; totalPrice: number }[] = [];

    for (const it of items) {
      const item = await this.prisma.barItem.findFirst({
        where: { id: it.barItemId, businessId },
      });
      if (!item) throw new NotFoundException(`Bar item ${it.barItemId} not found`);
      // Prevent negative stock for tracked items
      if (item.inventoryItemId) {
        const inv = await this.prisma.inventoryItem.findFirst({
          where: { id: item.inventoryItemId, businessId, branchId },
          select: { quantity: true },
        });
        if (inv && inv.quantity < it.quantity) {
          throw new BadRequestException(`Insufficient stock for ${item.name}`);
        }
      }
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
        createdById: createdBy.userId,
        createdByRole: createdBy.role,
        createdByWorkerId: createdBy.workerId ?? null,
        createdByWorkerName: createdBy.workerName ?? null,
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

    await this.logAudit(businessId, createdBy, 'bar_order_created', 'bar_order', order.id, {
      orderNumber,
      paymentMethod,
      items: orderItems.map((i) => ({ barItemId: i.barItemId, quantity: i.quantity })),
    });

    return order;
  }

  async getRestockPermission(businessId: string) {
    const s = await this.prisma.businessSetting.findFirst({
      where: { businessId, key: 'barRestockPermission' },
    });
    if (!s) return { enabled: false };
    let val: any = null;
    try {
      val = JSON.parse(s.value);
    } catch {
      val = null;
    }
    const enabled = val?.enabled === true;
    const expiresAt = val?.expiresAt ? new Date(val.expiresAt) : null;
    const active = enabled && (!expiresAt || expiresAt.getTime() > Date.now());
    return {
      enabled: active,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      approvedById: val?.approvedById ?? null,
      approvedByRole: val?.approvedByRole ?? null,
      approvedByWorkerName: val?.approvedByWorkerName ?? null,
      approvedAt: val?.approvedAt ?? null,
    };
  }

  async setRestockPermission(
    businessId: string,
    enabled: boolean,
    approvedBy: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
    expiresMinutes?: number | null,
  ) {
    const payload = {
      enabled: enabled === true,
      approvedById: approvedBy.userId,
      approvedByRole: approvedBy.role,
      approvedByWorkerId: approvedBy.workerId ?? null,
      approvedByWorkerName: approvedBy.workerName ?? null,
      approvedAt: new Date().toISOString(),
      expiresAt:
        enabled && expiresMinutes && expiresMinutes > 0
          ? new Date(Date.now() + expiresMinutes * 60_000).toISOString()
          : null,
    };
    const value = JSON.stringify(payload);
    const existing = await this.prisma.businessSetting.findFirst({
      where: { businessId, key: 'barRestockPermission' },
    });
    if (existing) {
      await this.prisma.businessSetting.update({ where: { id: existing.id }, data: { value } });
    } else {
      await this.prisma.businessSetting.create({ data: { businessId, key: 'barRestockPermission', value } });
    }
    return this.getRestockPermission(businessId);
  }

  async getAddItemPermission(businessId: string) {
    const s = await this.prisma.businessSetting.findFirst({
      where: { businessId, key: 'barAddItemPermission' },
    });
    if (!s) return { enabled: false };
    let val: any = null;
    try {
      val = JSON.parse(s.value);
    } catch {
      val = null;
    }
    const enabled = val?.enabled === true;
    const expiresAt = val?.expiresAt ? new Date(val.expiresAt) : null;
    const active = enabled && (!expiresAt || expiresAt.getTime() > Date.now());
    return {
      enabled: active,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      approvedById: val?.approvedById ?? null,
      approvedByRole: val?.approvedByRole ?? null,
      approvedByWorkerName: val?.approvedByWorkerName ?? null,
      approvedAt: val?.approvedAt ?? null,
    };
  }

  async setAddItemPermission(
    businessId: string,
    enabled: boolean,
    approvedBy: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
    expiresMinutes?: number | null,
  ) {
    const payload = {
      enabled: enabled === true,
      approvedById: approvedBy.userId,
      approvedByRole: approvedBy.role,
      approvedByWorkerId: approvedBy.workerId ?? null,
      approvedByWorkerName: approvedBy.workerName ?? null,
      approvedAt: new Date().toISOString(),
      expiresAt:
        enabled && expiresMinutes && expiresMinutes > 0
          ? new Date(Date.now() + expiresMinutes * 60_000).toISOString()
          : null,
    };
    const value = JSON.stringify(payload);
    const existing = await this.prisma.businessSetting.findFirst({
      where: { businessId, key: 'barAddItemPermission' },
    });
    if (existing) {
      await this.prisma.businessSetting.update({ where: { id: existing.id }, data: { value } });
    } else {
      await this.prisma.businessSetting.create({ data: { businessId, key: 'barAddItemPermission', value } });
    }
    return this.getAddItemPermission(businessId);
  }

  private async logAudit(
    businessId: string,
    user: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: object,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          businessId,
          userId: user.userId,
          role: user.role,
          workerId: user.workerId ?? null,
          workerName: user.workerName ?? null,
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

  async createRestock(
    businessId: string,
    branchId: string,
    actor: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
    items: { barItemId: string; quantityAdded: number }[],
  ) {
    if (!Array.isArray(items) || items.length === 0) throw new BadRequestException('No items');
    if (actor.role === 'BAR') {
      const perm = await this.getRestockPermission(businessId);
      if (!perm.enabled) throw new ForbiddenException('Restock not permitted');
    }

    const perm = await this.getRestockPermission(businessId);
    const approvedBy =
      actor.role === 'BAR'
        ? {
            userId: perm.approvedById as string,
            role: (perm.approvedByRole as string) || 'MANAGER',
            workerName: (perm.approvedByWorkerName as string) || null,
          }
        : { userId: actor.userId, role: actor.role, workerName: actor.workerName ?? null };

    if (actor.role === 'BAR' && !approvedBy.userId) throw new ForbiddenException('Missing approval');

    const restock = await this.prisma.$transaction(async (tx) => {
      const created = await tx.barRestock.create({
        data: {
          businessId,
          branchId,
          createdById: actor.userId,
          createdByRole: actor.role,
          createdByWorkerId: actor.workerId ?? null,
          createdByWorkerName: actor.workerName ?? null,
          approvedById: approvedBy.userId,
          approvedByRole: approvedBy.role,
          approvedByWorkerId: null,
          approvedByWorkerName: approvedBy.workerName ?? null,
          approvedAt: new Date(),
        },
      });

      for (const it of items) {
        if (!it?.barItemId) continue;
        const qty = Number(it.quantityAdded);
        if (!qty || qty < 1) continue;

        const barItem = await tx.barItem.findFirst({
          where: { id: it.barItemId, businessId },
        });
        if (!barItem) throw new NotFoundException(`Bar item ${it.barItemId} not found`);
        // Auto-link old bar items to inventory so they can be restocked.
        // Strategy: reuse existing inventory item named "BAR:<name>" if present, otherwise create one.
        let inventoryItemId = barItem.inventoryItemId;
        if (!inventoryItemId) {
          const invExisting = await tx.inventoryItem.findFirst({
            where: { businessId, branchId, name: `BAR:${barItem.name}` },
            select: { id: true },
          });
          if (invExisting) {
            inventoryItemId = invExisting.id;
          } else {
            const invCreated = await tx.inventoryItem.create({
              data: {
                businessId,
                branchId,
                name: `BAR:${barItem.name}`,
                quantity: 0,
                minQuantity: 5,
                unitPrice: new Decimal(0),
                createdBy: actor.userId,
              },
              select: { id: true },
            });
            inventoryItemId = invCreated.id;
          }
          await tx.barItem.update({
            where: { id: barItem.id },
            data: { inventoryItemId },
          });
        }

        const inv = await tx.inventoryItem.findFirst({
          where: { id: inventoryItemId, businessId, branchId },
        });
        if (!inv) throw new NotFoundException('Inventory item not found');

        const before = inv.quantity;
        const after = before + qty;
        await tx.inventoryItem.update({
          where: { id: inv.id },
          data: { quantity: { increment: qty } },
        });
        await tx.barRestockItem.create({
          data: {
            restockId: created.id,
            barItemId: barItem.id,
            inventoryItemId: inv.id,
            stockBefore: before,
            quantityAdded: qty,
            stockAfter: after,
          },
        });
      }
      return created;
    });

    await this.logAudit(
      businessId,
      actor,
      'bar_restock_created',
      'bar_restock',
      restock.id,
      { approvedById: approvedBy.userId, approvedByRole: approvedBy.role },
    );

    return restock;
  }

  async listMyOrders(
    businessId: string,
    branchId: string,
    actor: { userId: string; role: string; workerId?: string | null; workerName?: string | null },
    from?: Date,
    to?: Date,
  ) {
    // Prefer worker-level filtering when available.
    const where: any = { businessId, branchId };
    if (actor.workerId) where.createdByWorkerId = actor.workerId;
    else where.createdById = actor.userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    return this.prisma.barOrder.findMany({
      where,
      include: { items: { include: { barItem: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listRestocks(businessId: string, branchId: string) {
    return this.prisma.barRestock.findMany({
      where: { businessId, branchId },
      include: { items: { include: { barItem: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getRestock(businessId: string, restockId: string) {
    const r = await this.prisma.barRestock.findFirst({
      where: { id: restockId, businessId },
      include: { items: { include: { barItem: true } } },
    });
    if (!r) throw new NotFoundException('Restock not found');
    return r;
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

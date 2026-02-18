import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PeriodFilter = 'day' | 'week' | 'month' | 'bydate';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  private getDateRange(period: PeriodFilter, from?: string, to?: string): { from: Date; to: Date } {
    const now = new Date();
    const endOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(23, 59, 59, 999);
      return x;
    };
    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    if (period === 'bydate' && from && to) {
      return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
    }
    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    if (period === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    return { from: startOfDay(now), to: endOfDay(now) };
  }

  async send(businessId: string, senderId: string, senderRole: string, recipientRole: string, body: string) {
    return this.prisma.roleMessage.create({
      data: {
        businessId,
        senderId,
        senderRole: senderRole || 'MANAGER',
        recipientRole,
        body: (body || '').trim(),
      },
    });
  }

  async list(
    businessId: string,
    opts: {
      period?: PeriodFilter;
      from?: string;
      to?: string;
      recipientRole?: string;
      senderRole?: string;
    },
  ) {
    const period = opts.period || 'day';
    const { from, to } = this.getDateRange(period, opts.from, opts.to);
    const where: { businessId: string; createdAt: { gte: Date; lte: Date }; recipientRole?: string; senderRole?: string } = {
      businessId,
      createdAt: { gte: from, lte: to },
    };
    if (opts.recipientRole && opts.recipientRole.trim()) where.recipientRole = opts.recipientRole.trim();
    if (opts.senderRole && opts.senderRole.trim()) where.senderRole = opts.senderRole.trim();

    const rows = await this.prisma.roleMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      senderId: r.senderId,
      senderRole: r.senderRole,
      recipientRole: r.recipientRole,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

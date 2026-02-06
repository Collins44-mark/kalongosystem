import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private async getBarSales(businessId: string, from?: Date, to?: Date) {
    const where: any = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    const r = await this.prisma.barOrder.aggregate({
      where,
      _sum: { totalAmount: true },
    });
    return Number(r._sum.totalAmount || 0);
  }

  private async getRestaurantSales(businessId: string, from?: Date, to?: Date) {
    const where: any = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    const r = await this.prisma.restaurantOrder.aggregate({
      where,
      _sum: { totalAmount: true },
    });
    return Number(r._sum.totalAmount || 0);
  }

  async getHotelRevenue(businessId: string, from?: Date, to?: Date) {
    const where: any = { businessId, status: 'CHECKED_OUT' };
    if (from || to) {
      where.checkOut = {};
      if (from) where.checkOut.gte = from;
      if (to) where.checkOut.lte = to;
    }
    const r = await this.prisma.booking.aggregate({
      where,
      _sum: { totalAmount: true },
    });
    return Number(r._sum.totalAmount || 0);
  }

  async getRevenue(businessId: string, from?: Date, to?: Date) {
    const bar = await this.getBarSales(businessId, from, to);
    const rest = await this.getRestaurantSales(businessId, from, to);
    const hotel = await this.getHotelRevenue(businessId, from, to);
    const total = bar + rest + hotel;
    return { bar, restaurant: rest, hotel, total };
  }

  async getExpenses(businessId: string, branchId: string, from?: Date, to?: Date) {
    const where: any = { businessId, branchId };
    if (from || to) {
      where.expenseDate = {};
      if (from) where.expenseDate.gte = from;
      if (to) where.expenseDate.lte = to;
    }
    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
    });
    const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { expenses, total };
  }

  async createExpense(
    businessId: string,
    branchId: string,
    data: {
      category: string;
      amount: number;
      description?: string;
      expenseDate: Date;
    },
    createdBy: string,
  ) {
    return this.prisma.expense.create({
      data: {
        businessId,
        branchId,
        category: data.category,
        amount: new Decimal(data.amount),
        description: data.description,
        expenseDate: data.expenseDate,
        createdBy,
      },
    });
  }

  async getNetProfit(businessId: string, branchId: string, from?: Date, to?: Date) {
    const rev = await this.getRevenue(businessId, from, to);
    const { total: expTotal } = await this.getExpenses(
      businessId,
      branchId,
      from,
      to,
    );
    return { revenue: rev.total, expenses: expTotal, netProfit: rev.total - expTotal };
  }

  async getDashboard(businessId: string, branchId: string, from?: Date, to?: Date) {
    const revenue = await this.getRevenue(businessId, from, to);
    const { expenses, total: expTotal } = await this.getExpenses(
      businessId,
      branchId,
      from,
      to,
    );
    const netProfit = revenue.total - expTotal;
    return {
      totalRevenue: revenue.total,
      totalExpenses: expTotal,
      netProfit,
      bySector: { bar: revenue.bar, restaurant: revenue.restaurant, hotel: revenue.hotel },
      expenses,
    };
  }
}

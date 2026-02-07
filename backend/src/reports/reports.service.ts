import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { BarService } from '../bar/bar.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { WorkersService } from '../workers/workers.service';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => FinanceService))
    private finance: FinanceService,
    private bar: BarService,
    private restaurant: RestaurantService,
    private workers: WorkersService,
  ) {}

  async getSalesReport(
    businessId: string,
    branchId: string,
    from?: Date,
    to?: Date,
  ) {
    const barSales = await this.bar.getSalesTotal(
      businessId,
      from,
      to,
    );
    const restSales = await this.restaurant.getSalesTotal(
      businessId,
      from,
      to,
    );
    const hotelRevenue = await this.finance.getHotelRevenue(
      businessId,
      from,
      to,
    );
    return {
      bar: barSales,
      restaurant: restSales,
      hotel: hotelRevenue,
      total: barSales.total + restSales.total + hotelRevenue,
    };
  }

  async getFinanceReport(
    businessId: string,
    branchId: string,
    from?: Date,
    to?: Date,
  ) {
    return this.finance.getDashboard(
      businessId,
      branchId,
      from,
      to,
    );
  }

  async getPayrollReport(
    businessId: string,
    month: number,
    year: number,
  ) {
    return this.workers.getPayroll(businessId, month, year);
  }

  async getBookingsReport(businessId: string, branchId: string, from?: Date, to?: Date) {
    const where: any = { businessId, branchId };
    if (from || to) {
      where.checkIn = {};
      if (from) where.checkIn.gte = from;
      if (to) where.checkIn.lte = to;
    }
    return this.prisma.booking.findMany({
      where,
      include: { room: { include: { category: true } } },
      orderBy: { checkIn: 'desc' },
    });
  }
}

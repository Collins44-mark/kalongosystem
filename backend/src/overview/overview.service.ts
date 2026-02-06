import { Injectable } from '@nestjs/common';
import { HotelService } from '../hotel/hotel.service';
import { FinanceService } from '../finance/finance.service';
import { InventoryService } from '../inventory/inventory.service';
import { BarService } from '../bar/bar.service';
import { RestaurantService } from '../restaurant/restaurant.service';

@Injectable()
export class OverviewService {
  constructor(
    private hotel: HotelService,
    private finance: FinanceService,
    private inventory: InventoryService,
    private bar: BarService,
    private restaurant: RestaurantService,
  ) {}

  async getDashboard(businessId: string, branchId: string, period: 'today' | 'week' | 'month') {
    const now = new Date();
    let from: Date;
    if (period === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      from = new Date(now);
      from.setDate(from.getDate() - 7);
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const roomSummary = await this.hotel.getRoomSummary(businessId, branchId);
    const finance = await this.finance.getDashboard(businessId, branchId, from, now);
    const lowStock = await this.inventory.getLowStock(businessId, branchId);
    const valueAtRisk = await this.inventory.getTotalValueAtRisk(businessId, branchId);
    const barSales = await this.bar.getSalesTotal(businessId, from, now);
    const restSales = await this.restaurant.getSalesTotal(businessId, from, now);
    const hotelRev = await this.finance.getHotelRevenue(businessId, from, now);

    return {
      roomSummary,
      financeSummary: {
        totalRevenue: finance.totalRevenue,
        totalExpenses: finance.totalExpenses,
        netProfit: finance.netProfit,
      },
      inventoryAlerts: {
        lowStock: lowStock.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          minQuantity: i.minQuantity,
          severity: i.quantity === 0 ? 'RED' : 'YELLOW',
        })),
        totalValueAtRisk: valueAtRisk,
      },
      salesBySector: {
        bar: barSales.total,
        restaurant: restSales.total,
        hotel: hotelRev,
        total: barSales.total + restSales.total + hotelRev,
      },
      period,
    };
  }
}

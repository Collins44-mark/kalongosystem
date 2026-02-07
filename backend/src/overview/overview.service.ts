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
    const empty = {
      roomSummary: { total: 0, occupied: 0, vacant: 0, reserved: 0, underMaintenance: 0 },
      financeSummary: { totalRevenue: 0, totalExpenses: 0, netProfit: 0 },
      inventoryAlerts: { lowStock: [], totalValueAtRisk: 0 },
      salesBySector: { bar: 0, restaurant: 0, hotel: 0, total: 0 },
      period,
    };

    try {
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

      const [roomSummary, finance, lowStock, valueAtRisk, barSales, restSales, hotelRev] =
        await Promise.all([
          this.hotel.getRoomSummary(businessId, branchId),
          this.finance.getDashboard(businessId, branchId, from, now),
          this.inventory.getLowStock(businessId, branchId),
          this.inventory.getTotalValueAtRisk(businessId, branchId),
          this.bar.getSalesTotal(businessId, from, now),
          this.restaurant.getSalesTotal(businessId, from, now),
          this.finance.getHotelRevenue(businessId, from, now),
        ]);

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
    } catch {
      return empty;
    }
  }
}

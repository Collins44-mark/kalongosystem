import { Injectable } from '@nestjs/common';
import { HotelService } from '../hotel/hotel.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class OverviewService {
  constructor(
    private hotel: HotelService,
    private inventory: InventoryService,
  ) {}

  async getDashboard(businessId: string, branchId: string, period: 'today' | 'week' | 'month') {
    const empty = {
      roomSummary: { total: 0, occupied: 0, vacant: 0, reserved: 0, underMaintenance: 0 },
      inventoryAlerts: { lowStock: [], totalValueAtRisk: 0 },
      period,
    };

    try {
      const [roomSummary, lowStock, valueAtRisk] = await Promise.all([
        this.hotel.getRoomSummary(businessId, branchId),
        this.inventory.getLowStock(businessId, branchId),
        this.inventory.getTotalValueAtRisk(businessId, branchId),
      ]);

      return {
        roomSummary,
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
        period,
      };
    } catch {
      return empty;
    }
  }
}

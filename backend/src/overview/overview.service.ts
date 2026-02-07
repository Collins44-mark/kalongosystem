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
    const emptyRoomSummary = { total: 0, occupied: 0, vacant: 0, reserved: 0, underMaintenance: 0 };
    const emptyInventory = { lowStock: [], totalValueAtRisk: 0 };

    const [roomSummaryResult, roomsResult, lowStockResult, valueResult] = await Promise.allSettled([
      this.hotel.getRoomSummary(businessId, branchId),
      this.hotel.getRooms(businessId),
      this.inventory.getLowStock(businessId, branchId),
      this.inventory.getTotalValueAtRisk(businessId, branchId),
    ]);

    const roomSummary = roomSummaryResult.status === 'fulfilled' ? roomSummaryResult.value : emptyRoomSummary;
    const rooms = roomsResult.status === 'fulfilled' ? roomsResult.value : [];
    const lowStock = lowStockResult.status === 'fulfilled' ? lowStockResult.value : [];
    const valueAtRisk = valueResult.status === 'fulfilled' ? valueResult.value : 0;

    return {
      roomSummary,
      rooms: Array.isArray(rooms) ? rooms : [],
      inventoryAlerts: {
        lowStock: Array.isArray(lowStock) ? lowStock.map((i: any) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          minQuantity: i.minQuantity,
          severity: i.quantity === 0 ? 'RED' : 'YELLOW',
        })) : [],
        totalValueAtRisk: typeof valueAtRisk === 'number' ? valueAtRisk : 0,
      },
      period,
    };
  }
}

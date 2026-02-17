import { Injectable } from '@nestjs/common';
import { HotelService } from '../hotel/hotel.service';
import { InventoryService } from '../inventory/inventory.service';
import { BarService } from '../bar/bar.service';

@Injectable()
export class OverviewService {
  constructor(
    private hotel: HotelService,
    private inventory: InventoryService,
    private bar: BarService,
  ) {}

  async getDashboard(businessId: string, branchId: string, period: 'today' | 'week' | 'month') {
    const emptyRoomSummary = { total: 0, occupied: 0, vacant: 0, reserved: 0, underMaintenance: 0 };
    const emptyInventory = { lowStock: [], totalValueAtRisk: 0 };
    const bid = branchId || 'main';

    const [roomSummaryResult, roomsResult, invLowResult, barLowResult, valueResult] = await Promise.allSettled([
      this.hotel.getRoomSummary(businessId, bid),
      this.hotel.getRooms(businessId),
      this.inventory.getLowStock(businessId, bid),
      this.bar.getLowStock(businessId, bid),
      this.inventory.getTotalValueAtRisk(businessId, bid),
    ]);

    const roomSummary = roomSummaryResult.status === 'fulfilled' ? roomSummaryResult.value : emptyRoomSummary;
    const rooms = roomsResult.status === 'fulfilled' ? roomsResult.value : [];
    const invLow = invLowResult.status === 'fulfilled' ? invLowResult.value : [];
    const barLow = barLowResult.status === 'fulfilled' ? barLowResult.value : [];
    const valueAtRisk = valueResult.status === 'fulfilled' ? valueResult.value : 0;

    // Exclude inventory items that are bar-linked (BAR:...) so we show them once via bar with display name
    const invLowFiltered = Array.isArray(invLow) ? invLow.filter((i: any) => !String(i.name || '').startsWith('BAR:')) : [];
    const lowStockList = [
      ...invLowFiltered.map((i: any) => ({ id: i.id, name: i.name, quantity: i.quantity, minQuantity: i.minQuantity })),
      ...(Array.isArray(barLow) ? barLow : []),
    ];

    return {
      roomSummary,
      rooms: Array.isArray(rooms) ? rooms : [],
      inventoryAlerts: {
        lowStock: lowStockList.map((i: any) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          minQuantity: i.minQuantity,
          severity: i.quantity === 0 ? 'RED' : 'YELLOW',
        })),
        totalValueAtRisk: typeof valueAtRisk === 'number' ? valueAtRisk : 0,
      },
      period,
    };
  }
}

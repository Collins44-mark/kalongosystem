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
      this.bar.getLowStock(businessId, 'main'), // bar items are typically on main; ensures overview matches bar page
      this.inventory.getTotalValueAtRisk(businessId, bid),
    ]);

    const roomSummary = roomSummaryResult.status === 'fulfilled' ? roomSummaryResult.value : emptyRoomSummary;
    const rooms = roomsResult.status === 'fulfilled' ? roomsResult.value : [];
    const invLow = invLowResult.status === 'fulfilled' ? invLowResult.value : [];
    const barLow = barLowResult.status === 'fulfilled' ? barLowResult.value : [];
    const valueAtRisk = valueResult.status === 'fulfilled' ? valueResult.value : 0;

    const barLowList = Array.isArray(barLow) ? barLow : [];
    const barNamesSet = new Set(barLowList.map((b: any) => String(b.name || '').toLowerCase()));
    
    // Inventory items: include non-BAR items, and BAR items as fallback (if not already in barLowList)
    const invBarItems = Array.isArray(invLow) ? invLow.filter((i: any) => String(i.name || '').startsWith('BAR:')) : [];
    const invNonBarItems = Array.isArray(invLow) ? invLow.filter((i: any) => !String(i.name || '').startsWith('BAR:')) : [];
    
    // BAR inventory items that aren't already covered by bar.getLowStock (by name match)
    const invBarFallback = invBarItems.filter((i: any) => {
      const barName = String(i.name || '').replace(/^BAR:/, '').trim().toLowerCase();
      return barName && !barNamesSet.has(barName);
    });
    
    // Merge: inventory (non-BAR) + bar low stock + BAR inventory fallback
    const lowStockList = [
      ...invNonBarItems.map((i: any) => ({ id: i.id, name: i.name, quantity: i.quantity, minQuantity: i.minQuantity })),
      ...barLowList,
      ...invBarFallback.map((i: any) => ({
        id: i.id,
        name: String(i.name || '').replace(/^BAR:/, '').trim() || i.name, // Strip BAR: prefix
        quantity: i.quantity,
        minQuantity: i.minQuantity,
      })),
    ];
    
    // Count bar items (from bar.getLowStock + BAR inventory fallback)
    const totalBarLowCount = barLowList.length + invBarFallback.length;

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
        barLowStockCount: totalBarLowCount,
        totalValueAtRisk: typeof valueAtRisk === 'number' ? valueAtRisk : 0,
      },
      period,
    };
  }
}

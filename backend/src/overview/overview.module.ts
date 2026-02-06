import { Module } from '@nestjs/common';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import { HotelModule } from '../hotel/hotel.module';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BarModule } from '../bar/bar.module';
import { RestaurantModule } from '../restaurant/restaurant.module';

@Module({
  imports: [HotelModule, FinanceModule, InventoryModule, BarModule, RestaurantModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}

import { Module } from '@nestjs/common';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import { HotelModule } from '../hotel/hotel.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [HotelModule, InventoryModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}

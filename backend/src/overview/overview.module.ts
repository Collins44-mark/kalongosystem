import { Module } from '@nestjs/common';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';
import { HotelModule } from '../hotel/hotel.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BarModule } from '../bar/bar.module';

@Module({
  imports: [BusinessModuleGuardModule, HotelModule, InventoryModule, BarModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}

import { Module } from '@nestjs/common';
import { HotelController } from './hotel.controller';
import { HotelService } from './hotel.service';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';
import { AccountingModule } from '../accounting/accounting.module';
import { OtherRevenueModule } from '../other-revenue/other-revenue.module';

@Module({
  imports: [BusinessModuleGuardModule, AccountingModule, OtherRevenueModule],
  controllers: [HotelController],
  providers: [HotelService],
  exports: [HotelService],
})
export class HotelModule {}

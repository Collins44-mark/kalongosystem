import { Module } from '@nestjs/common';
import { HotelController } from './hotel.controller';
import { HotelService } from './hotel.service';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [BusinessModuleGuardModule, AccountingModule],
  controllers: [HotelController],
  providers: [HotelService],
  exports: [HotelService],
})
export class HotelModule {}

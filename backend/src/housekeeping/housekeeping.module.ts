import { Module } from '@nestjs/common';
import { HousekeepingController } from './housekeeping.controller';
import { HousekeepingService } from './housekeeping.service';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [BusinessModuleGuardModule, NotificationsModule],
  controllers: [HousekeepingController],
  providers: [HousekeepingService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}

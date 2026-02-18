import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';

@Module({
  imports: [BusinessModuleGuardModule],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}

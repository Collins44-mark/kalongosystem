import { forwardRef, Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { FinanceModule } from '../finance/finance.module';
import { BarModule } from '../bar/bar.module';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { WorkersModule } from '../workers/workers.module';

@Module({
  imports: [
    forwardRef(() => FinanceModule),
    BarModule,
    RestaurantModule,
    WorkersModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

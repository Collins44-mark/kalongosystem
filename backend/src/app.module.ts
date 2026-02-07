import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ApiModule } from './api/api.module';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { HotelModule } from './hotel/hotel.module';
import { BarModule } from './bar/bar.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { InventoryModule } from './inventory/inventory.module';
import { HousekeepingModule } from './housekeeping/housekeeping.module';
import { FinanceModule } from './finance/finance.module';
import { WorkersModule } from './workers/workers.module';
import { ReportsModule } from './reports/reports.module';
import { OverviewModule } from './overview/overview.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ApiModule,
    AuthModule,
    BusinessModule,
    SubscriptionModule,
    HotelModule,
    BarModule,
    RestaurantModule,
    InventoryModule,
    HousekeepingModule,
    FinanceModule,
    WorkersModule,
    ReportsModule,
    OverviewModule,
    HealthModule,
  ],
})
export class AppModule {}

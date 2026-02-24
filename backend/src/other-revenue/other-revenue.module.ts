import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { OtherRevenueService } from './other-revenue.service';
import { OtherRevenueController } from './other-revenue.controller';

@Module({
  imports: [PrismaModule, AccountingModule],
  providers: [OtherRevenueService],
  controllers: [OtherRevenueController],
  exports: [OtherRevenueService],
})
export class OtherRevenueModule {}


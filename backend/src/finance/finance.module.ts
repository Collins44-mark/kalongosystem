import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [BusinessModuleGuardModule, AccountingModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}

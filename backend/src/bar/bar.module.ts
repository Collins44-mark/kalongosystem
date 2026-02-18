import { Module } from '@nestjs/common';
import { BarController } from './bar.controller';
import { BarService } from './bar.service';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';

@Module({
  imports: [BusinessModuleGuardModule],
  controllers: [BarController],
  providers: [BarService],
  exports: [BarService],
})
export class BarModule {}

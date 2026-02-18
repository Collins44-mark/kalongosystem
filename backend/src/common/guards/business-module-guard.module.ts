import { Module } from '@nestjs/common';
import { BusinessModuleGuard } from './business-module.guard';

@Module({
  providers: [BusinessModuleGuard],
  exports: [BusinessModuleGuard],
})
export class BusinessModuleGuardModule {}

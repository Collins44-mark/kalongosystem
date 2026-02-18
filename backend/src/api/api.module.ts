import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';
import { StaffWorkersModule } from '../staff-workers/staff-workers.module';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';

@Module({
  imports: [StaffWorkersModule, BusinessModuleGuardModule],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}

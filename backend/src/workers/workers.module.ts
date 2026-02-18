import { Module } from '@nestjs/common';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';

@Module({
  imports: [BusinessModuleGuardModule],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}

import { Module } from '@nestjs/common';
import { BusinessModuleGuardModule } from '../common/guards/business-module-guard.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [BusinessModuleGuardModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}


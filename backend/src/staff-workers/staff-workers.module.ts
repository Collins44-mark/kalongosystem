import { Module } from '@nestjs/common';
import { StaffWorkersController } from './staff-workers.controller';
import { StaffWorkersService } from './staff-workers.service';

@Module({
  controllers: [StaffWorkersController],
  providers: [StaffWorkersService],
  exports: [StaffWorkersService],
})
export class StaffWorkersModule {}

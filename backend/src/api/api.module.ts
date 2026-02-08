import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';
import { StaffWorkersModule } from '../staff-workers/staff-workers.module';

@Module({
  imports: [StaffWorkersModule],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}

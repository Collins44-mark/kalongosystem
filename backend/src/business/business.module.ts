import { Module } from '@nestjs/common';
import { BusinessApiController, BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BusinessController, BusinessApiController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}

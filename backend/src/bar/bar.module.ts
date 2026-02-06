import { Module } from '@nestjs/common';
import { BarController } from './bar.controller';
import { BarService } from './bar.service';

@Module({
  controllers: [BarController],
  providers: [BarService],
  exports: [BarService],
})
export class BarModule {}

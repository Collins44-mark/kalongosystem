import { Module } from '@nestjs/common';
import { HealthController, RootController } from './health.controller';

@Module({
  controllers: [RootController, HealthController],
})
export class HealthModule {}

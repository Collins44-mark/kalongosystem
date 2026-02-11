import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'hms-secret-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminGuard],
})
export class SuperAdminModule {}


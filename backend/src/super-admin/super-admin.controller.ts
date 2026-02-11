import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';

@Controller('super-admin')
export class SuperAdminController {
  constructor(private sa: SuperAdminService) {}

  @Post('login')
  async login(@Body() dto: { businessId: string; email: string; password: string }) {
    return this.sa.login(dto.businessId, dto.email, dto.password);
  }

  @Get('businesses')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async businesses() {
    return this.sa.listBusinesses();
  }

  @Get('businesses/:id')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async businessDetail(@Param('id') id: string) {
    return this.sa.getBusinessDetail(id);
  }

  @Post('businesses/:id/suspend')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async suspend(@Param('id') id: string, @Body('suspended') suspended: boolean) {
    return this.sa.setBusinessSuspended(id, !!suspended);
  }

  @Post('business-users/:id/reset-password')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async resetPassword(@Param('id') businessUserId: string) {
    return this.sa.resetBusinessUserPassword(businessUserId);
  }
}


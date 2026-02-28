import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';

@Controller('super-admin')
export class SuperAdminController {
  constructor(private sa: SuperAdminService) {}

  /** One-time seed when Shell is not available. Set env SEED_SECRET on Render, then GET this URL once. */
  @Get('seed')
  async seed(@Query('secret') secret: string) {
    const expected = process.env.SEED_SECRET;
    if (!expected || secret !== expected) {
      return { ok: false, message: 'Missing or invalid secret. Set SEED_SECRET on Render and call with ?secret=YOUR_SEED_SECRET.' };
    }
    return this.sa.seedSuperAdmin();
  }

  /** Delete a user and their businesses by email (so they can sign up again). Same secret as seed. */
  @Get('delete-user')
  async deleteUser(@Query('secret') secret: string, @Query('email') email: string) {
    const expected = process.env.SEED_SECRET;
    if (!expected || secret !== expected) {
      return { ok: false, message: 'Missing or invalid secret. Use ?secret=YOUR_SEED_SECRET&email=user@example.com' };
    }
    if (!email || !email.includes('@')) {
      return { ok: false, message: 'Valid email query parameter required.' };
    }
    return this.sa.deleteUserByEmail(email);
  }

  @Post('login')
  async login(@Body() dto: { businessId: string; email: string; password: string }) {
    return this.sa.login(dto.businessId, dto.email, dto.password);
  }

  @Post('businesses')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async registerBusiness(@Body() body: {
    name: string;
    businessType?: string;
    location?: string;
    phone?: string;
    email: string;
    oneTimePassword: string;
  }) {
    return this.sa.registerBusiness({
      name: body.name,
      businessType: body.businessType || 'HOTEL',
      location: body.location,
      phone: body.phone,
      email: body.email,
      oneTimePassword: body.oneTimePassword,
    });
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

  @Patch('businesses/:id')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async updateBusiness(@Param('id') id: string, @Body() body: { businessType?: string }) {
    if (body.businessType != null) return this.sa.updateBusinessType(id, body.businessType);
    return { success: true };
  }

  @Post('businesses/:id/unlock-subscription')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async unlockSubscription(
    @Param('id') id: string,
    @Body('durationDays') durationDays: number,
  ) {
    return this.sa.unlockSubscription(id, Number(durationDays) || 30);
  }

  @Post('business-users/:id/reset-password')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async resetPassword(@Param('id') businessUserId: string) {
    return this.sa.resetBusinessUserPassword(businessUserId);
  }
}


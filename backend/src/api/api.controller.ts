import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowManagerGuard } from '../common/guards/allow-manager.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiService } from './api.service';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class ApiController {
  constructor(private api: ApiService) {}

  @Get('me')
  async getMe(@CurrentUser() user: { sub: string; email: string; businessId: string; role: string; businessCode?: string }) {
    return this.api.getMe(user);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: { sub: string },
    @Body() dto: { language?: string },
  ) {
    if (dto.language) {
      return this.api.updateLanguage(user.sub, dto.language);
    }
    throw new BadRequestException('No update data');
  }

  @Get('settings')
  async getSettings(@CurrentUser() user: { businessId: string }) {
    return this.api.getSettings(user.businessId);
  }

  @Patch('settings')
  @UseGuards(AllowManagerGuard)
  async updateSettings(
    @CurrentUser() user: { businessId: string },
    @Body()
    dto: {
      enableDragDropBooking?: boolean;
      vat_enabled?: boolean;
      vat_name?: string;
      vat_rate?: number;
      vat_type?: 'inclusive' | 'exclusive';
      vat_apply_rooms?: boolean;
      vat_apply_bar?: boolean;
      vat_apply_restaurant?: boolean;
      taxes?: unknown;
    },
  ) {
    if (typeof dto.enableDragDropBooking === 'boolean') {
      return this.api.updateSetting(user.businessId, 'enableDragDropBooking', dto.enableDragDropBooking);
    }
    const updates: Array<Promise<any>> = [];
    if (typeof dto.vat_enabled === 'boolean') {
      updates.push(this.api.updateSetting(user.businessId, 'vat_enabled', dto.vat_enabled));
    }
    if (typeof dto.vat_name === 'string') {
      updates.push(this.api.updateSetting(user.businessId, 'vat_name', dto.vat_name.trim()));
    }
    if (typeof dto.vat_rate === 'number' && isFinite(dto.vat_rate)) {
      // accept percent (18) or decimal (0.18)
      const r = dto.vat_rate > 1 ? dto.vat_rate / 100 : dto.vat_rate;
      updates.push(this.api.updateSetting(user.businessId, 'vat_rate', Math.max(0, r)));
    }
    if (dto.vat_type === 'inclusive' || dto.vat_type === 'exclusive') {
      updates.push(this.api.updateSetting(user.businessId, 'vat_type', dto.vat_type));
    }
    if (typeof dto.vat_apply_rooms === 'boolean') {
      updates.push(this.api.updateSetting(user.businessId, 'vat_apply_rooms', dto.vat_apply_rooms));
    }
    if (typeof dto.vat_apply_bar === 'boolean') {
      updates.push(this.api.updateSetting(user.businessId, 'vat_apply_bar', dto.vat_apply_bar));
    }
    if (typeof dto.vat_apply_restaurant === 'boolean') {
      updates.push(this.api.updateSetting(user.businessId, 'vat_apply_restaurant', dto.vat_apply_restaurant));
    }
    if (Array.isArray(dto.taxes)) {
      updates.push(this.api.updateSetting(user.businessId, 'taxes', dto.taxes));
    }
    if (updates.length > 0) {
      await Promise.all(updates);
      return this.api.getSettings(user.businessId);
    }
    throw new BadRequestException('No valid setting to update');
  }
}

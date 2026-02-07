import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { BusinessService } from './business.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

class RegisterBusinessDto {
  @IsString()
  @IsIn(['HOTEL', 'LODGE', 'BAR', 'RESTAURANT'])
  businessType: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

@Controller('business')
export class BusinessController {
  constructor(
    private business: BusinessService,
    private auth: AuthService,
  ) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  async register(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegisterBusinessDto,
  ) {
    const result = await this.business.create({
      userId,
      businessType: dto.businessType,
      name: dto.name,
      location: dto.location,
      phone: dto.phone,
    });

    const bu = result.businessUser!;
    const token = this.auth.createTokenForBusinessUser(
      { userId: bu.userId, businessId: bu.businessId, role: bu.role, branchId: bu.branchId },
      { email: bu.user.email },
      result.business.businessId,
    );

    return {
      ...result,
      accessToken: token,
      user: {
        id: bu.userId,
        email: bu.user.email,
        businessId: result.business.businessId,
        role: bu.role,
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentBusiness(@CurrentUser('businessId') businessId: string) {
    return this.business.getById(businessId);
  }

  @Get('check/:businessId')
  async checkBusiness(@Param('businessId') businessId: string) {
    return this.business.getByCode(businessId);
  }
}

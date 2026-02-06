import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsIn, IsString } from 'class-validator';

class PaymentDto {
  @IsString()
  @IsIn(['FRONT_OFFICE_ONLY', 'FRONT_AND_BACK'])
  plan: string;

  @IsString()
  @IsIn(['MOBILE_MONEY', 'BANK'])
  paymentMethod: string;
}

@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private subscription: SubscriptionService) {}

  @Get()
  async get(@CurrentUser('businessId') businessId: string) {
    return this.subscription.getForBusiness(businessId);
  }

  @Post('pay')
  async pay(
    @CurrentUser('businessId') businessId: string,
    @Body() dto: PaymentDto,
  ) {
    return this.subscription.processPayment(
      businessId,
      dto.plan,
      dto.paymentMethod,
    );
  }
}

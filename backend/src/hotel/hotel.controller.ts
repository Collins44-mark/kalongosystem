import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { HotelService } from './hotel.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

class CreateCategoryDto {
  @IsString()
  name: string;
  @IsNumber()
  @Min(0)
  pricePerNight: number;
  @IsString()
  @IsOptional()
  description?: string;
}

class CreateRoomDto {
  @IsString()
  categoryId: string;
  @IsString()
  roomNumber: string;
}

class CreateBookingDto {
  @IsString()
  roomId: string;
  @IsString()
  guestName: string;
  @IsString()
  @IsOptional()
  guestPhone?: string;
  @IsDateString()
  checkIn: string;
  @IsDateString()
  checkOut: string;
  @IsNumber()
  @Min(1)
  nights: number;
}

@Controller('hotel')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@UseGuards(RolesGuard)
@Roles('ADMIN', 'FRONT_OFFICE')
export class HotelController {
  constructor(private hotel: HotelService) {}

  @Post('categories')
  async createCategory(
    @CurrentUser() user: any,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.hotel.createCategory(
      user.businessId,
      user.branchId,
      dto,
      user.sub,
    );
  }

  @Get('categories')
  async getCategories(@CurrentUser() user: any) {
    return this.hotel.getCategories(user.businessId, user.branchId);
  }

  @Post('rooms')
  async createRoom(@CurrentUser() user: any, @Body() dto: CreateRoomDto) {
    return this.hotel.createRoom(
      user.businessId,
      user.branchId,
      dto,
      user.sub,
    );
  }

  @Get('rooms')
  async getRooms(@CurrentUser() user: any) {
    return this.hotel.getRooms(user.businessId, user.branchId);
  }

  @Put('rooms/:id/status')
  async updateRoomStatus(
    @CurrentUser() user: any,
    @Param('id') roomId: string,
    @Body('status') status: string,
  ) {
    return this.hotel.updateRoomStatus(user.businessId, roomId, status);
  }

  @Post('bookings')
  async createBooking(
    @CurrentUser() user: any,
    @Body() dto: CreateBookingDto,
  ) {
    return this.hotel.createBooking(
      user.businessId,
      user.branchId,
      {
        ...dto,
        checkIn: new Date(dto.checkIn),
        checkOut: new Date(dto.checkOut),
      },
      user.sub,
    );
  }

  @Get('bookings')
  async getBookings(@CurrentUser() user: any) {
    return this.hotel.getBookings(user.businessId, user.branchId);
  }

  @Post('bookings/:id/check-in')
  async checkIn(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hotel.checkIn(id, user.businessId);
  }

  @Post('bookings/:id/check-out')
  async checkOut(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hotel.checkOut(id, user.businessId);
  }

  @Get('summary')
  async getSummary(@CurrentUser() user: any) {
    return this.hotel.getRoomSummary(user.businessId, user.branchId);
  }
}

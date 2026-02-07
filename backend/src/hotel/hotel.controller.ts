import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
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
@Roles('MANAGER', 'FRONT_OFFICE')
export class HotelController {
  constructor(private hotel: HotelService) {}

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
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
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
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
  async getBookings(
    @CurrentUser() user: any,
    @Query('scope') scope?: 'all' | 'today' | 'mine',
  ) {
    const isManager = user.role === 'MANAGER' || user.role === 'ADMIN';
    const s = scope && ['all', 'today', 'mine'].includes(scope)
      ? scope
      : isManager
        ? 'all'
        : 'today';
    const opts = s === 'all' ? undefined : { scope: s, userId: user.sub };
    return this.hotel.getBookings(user.businessId, user.branchId, opts);
  }

  @Post('bookings/:id/check-in')
  async checkIn(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hotel.checkIn(id, user.businessId, user.sub);
  }

  @Post('bookings/:id/check-out')
  async checkOut(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hotel.checkOut(id, user.businessId);
  }

  @Post('bookings/:id/cancel')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  async cancelBooking(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hotel.cancelBooking(id, user.businessId);
  }

  @Put('bookings/:id/room')
  async changeRoom(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('roomId') roomId: string,
  ) {
    return this.hotel.changeRoom(id, user.businessId, roomId, user.sub);
  }

  @Put('bookings/:id/extend')
  async extendStay(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('checkOut') checkOut: string,
  ) {
    return this.hotel.extendStay(id, user.businessId, new Date(checkOut));
  }

  @Put('bookings/:id/status')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  async overrideStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.hotel.overrideStatus(id, user.businessId, status);
  }

  @Get('summary')
  async getSummary(@CurrentUser() user: any) {
    return this.hotel.getRoomSummary(user.businessId, user.branchId);
  }
}

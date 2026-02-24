import {
  Body,
  Controller,
  Delete,
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
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles, SkipRolesGuard } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AllowManagerGuard } from '../common/guards/allow-manager.guard';
import { OtherRevenueService } from '../other-revenue/other-revenue.service';
import {
  IsBoolean,
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
  @IsString()
  @IsOptional()
  roomName?: string;
}

class CreateBookingDto {
  @IsString()
  roomId: string;
  @IsString()
  guestName: string;
  @IsString()
  guestPhone: string;
  @IsDateString()
  checkIn: string;
  @IsDateString()
  checkOut: string;
  @IsNumber()
  @Min(1)
  nights: number;
  @IsNumber()
  @IsOptional()
  @Min(0)
  totalAmount?: number;
  @IsString()
  @IsOptional()
  currency?: string;
  @IsString()
  @IsOptional()
  paymentMode?: string;
  @IsNumber()
  @IsOptional()
  @Min(0)
  paidAmount?: number;
  @IsOptional()
  @IsBoolean()
  checkInImmediately?: boolean; // if true, create as CHECKED_IN (active folio) and room OCCUPIED
}

class AddPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;
  @IsString()
  paymentMode: string;
}

class AddBookingChargeDto {
  @IsString()
  categoryId: string;
  @IsString()
  @IsOptional()
  description?: string;
  @IsNumber()
  @Min(0.01)
  amount: number;
  @IsString()
  paymentMethod: string; // CASH | BANK | CARD
  @IsDateString()
  date: string;
}

@Controller('hotel')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
@UseGuards(RolesGuard)
@RequireModule('front-office')
@Roles('MANAGER', 'ADMIN', 'OWNER', 'FRONT_OFFICE')
export class HotelController {
  constructor(
    private hotel: HotelService,
    private otherRevenue: OtherRevenueService,
  ) {}

  @Post('categories')
  @SkipRolesGuard()
  @UseGuards(AllowManagerGuard)
  async createCategory(
    @CurrentUser() user: any,
    @Body() dto: CreateCategoryDto,
  ) {
    const cat = await this.hotel.createCategory(
      user.businessId,
      user.branchId || 'main',
      dto,
      user.sub,
    );
    await this.hotel.logAudit(user.sub, user.role || 'MANAGER', user.businessId, 'category_created', 'room_category', cat.id, undefined, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return {
      id: cat.id,
      name: cat.name,
      pricePerNight: String(cat.pricePerNight),
    };
  }

  @Get('categories')
  @SkipRolesGuard()
  async getCategories(@CurrentUser() user: any) {
    return this.hotel.getCategories(user.businessId);
  }

  @Put('categories/:id')
  @SkipRolesGuard()
  @UseGuards(AllowManagerGuard)
  async updateCategory(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { name?: string; pricePerNight?: number },
  ) {
    const cat = await this.hotel.updateCategory(user.businessId, id, dto);
    return { id: cat.id, name: cat.name, pricePerNight: String(cat.pricePerNight) };
  }

  @Delete('categories/:id')
  @SkipRolesGuard()
  @UseGuards(AllowManagerGuard)
  async deleteCategory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hotel.deleteCategory(user.businessId, id);
  }

  @Post('rooms')
  @SkipRolesGuard()
  @UseGuards(AllowManagerGuard)
  async createRoom(@CurrentUser() user: any, @Body() dto: CreateRoomDto) {
    const room = await this.hotel.createRoom(
      user.businessId,
      user.branchId || 'main',
      dto,
      user.sub,
    );
    await this.hotel.logAudit(user.sub, user.role || 'MANAGER', user.businessId, 'room_created', 'room', room.id, undefined, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return room;
  }

  @Get('rooms')
  @SkipRolesGuard()
  async getRooms(@CurrentUser() user: any) {
    return this.hotel.getRooms(user.businessId);
  }

  @Put('rooms/:id')
  @SkipRolesGuard()
  @UseGuards(AllowManagerGuard)
  async updateRoom(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { roomNumber?: string; roomName?: string; categoryId?: string },
  ) {
    const room = await this.hotel.updateRoom(user.businessId, id, dto);
    return {
      id: room.id,
      roomNumber: room.roomNumber,
      roomName: room.roomName,
      status: room.status,
      category: { id: room.category.id, name: room.category.name, pricePerNight: String(room.category.pricePerNight) },
    };
  }

  @Delete('rooms/:id')
  @SkipRolesGuard()
  @UseGuards(AllowManagerGuard)
  async deleteRoom(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hotel.deleteRoom(user.businessId, id);
  }

  @Put('rooms/:id/status')
  @SkipRolesGuard()
  async updateRoomStatus(
    @CurrentUser() user: any,
    @Param('id') roomId: string,
    @Body('status') status: string,
  ) {
    return this.hotel.updateRoomStatus(
      user.businessId,
      roomId,
      status,
      user.sub,
      user.role,
    );
  }

  @Post('bookings')
  @SkipRolesGuard()
  async createBooking(
    @CurrentUser() user: any,
    @Body() dto: CreateBookingDto,
  ) {
    const booking = await this.hotel.createBooking(
      user.businessId,
      user.branchId || 'main',
      {
        ...dto,
        checkIn: new Date(dto.checkIn),
        checkOut: new Date(dto.checkOut),
        currency: dto.currency,
        paymentMode: dto.paymentMode,
        checkInImmediately: dto.checkInImmediately,
        paidAmount: dto.paidAmount,
      },
      user.sub,
      user.role,
      user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined,
    );
    await this.hotel.logAudit(user.sub, user.role || 'USER', user.businessId, 'booking_created', 'booking', booking.id, undefined, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return booking;
  }

  @Get('bookings')
  @SkipRolesGuard()
  async getBookings(
    @CurrentUser() user: any,
    @Query('scope') scope?: 'all' | 'today' | 'mine',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const isManager = ['MANAGER', 'ADMIN', 'OWNER'].includes(user.role || '');
    const s = scope && ['all', 'today', 'mine'].includes(scope)
      ? scope
      : isManager
        ? 'all'
        : 'today';
    const opts = s === 'all' ? undefined : { scope: s, userId: user.sub };
    const dateRange = from && to ? { from, to } : undefined;
    return this.hotel.getBookings(user.businessId, user.branchId || 'main', opts, dateRange);
  }

  @Post('bookings/:id/check-in')
  @SkipRolesGuard()
  async checkIn(@CurrentUser() user: any, @Param('id') id: string) {
    const res = await this.hotel.checkIn(id, user.businessId, user.sub);
    await this.hotel.logAudit(user.sub, user.role || 'USER', user.businessId, 'booking_checked_in', 'booking', id, undefined, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return res;
  }

  @Post('bookings/:id/check-out')
  @SkipRolesGuard()
  async checkOut(@CurrentUser() user: any, @Param('id') id: string) {
    const res = await this.hotel.checkOut(id, user.businessId);
    await this.hotel.logAudit(user.sub, user.role || 'USER', user.businessId, 'booking_checked_out', 'booking', id, undefined, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return res;
  }

  @Post('bookings/:id/cancel')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async cancelBooking(@CurrentUser() user: any, @Param('id') id: string) {
    const res = await this.hotel.cancelBooking(id, user.businessId);
    await this.hotel.logAudit(user.sub, user.role || 'MANAGER', user.businessId, 'booking_cancelled', 'booking', id, undefined, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return res;
  }

  @Put('bookings/:id/room')
  @SkipRolesGuard()
  async changeRoom(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('roomId') roomId: string,
  ) {
    const res = await this.hotel.changeRoom(id, user.businessId, roomId, user.sub);
    await this.hotel.logAudit(user.sub, user.role || 'USER', user.businessId, 'booking_room_changed', 'booking', id, { roomId }, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return res;
  }

  @Put('bookings/:id/extend')
  @SkipRolesGuard()
  async extendStay(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('checkOut') checkOut: string,
  ) {
    const res = await this.hotel.extendStay(id, user.businessId, new Date(checkOut));
    await this.hotel.logAudit(user.sub, user.role || 'USER', user.businessId, 'booking_extended', 'booking', id, undefined, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return res;
  }

  @Put('bookings/:id/status')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async overrideStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    const res = await this.hotel.overrideStatus(id, user.businessId, status);
    await this.hotel.logAudit(user.sub, user.role || 'MANAGER', user.businessId, 'booking_status_overridden', 'booking', id, { status }, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return res;
  }

  @Post('bookings/:id/payments')
  @SkipRolesGuard()
  async addPayment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
  ) {
    const res = await this.hotel.addPayment(
      id,
      user.businessId,
      { amount: dto.amount, paymentMode: dto.paymentMode },
      user.sub,
      user.role,
      user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined,
    );
    await this.hotel.logAudit(user.sub, user.role || 'USER', user.businessId, 'payment_added', 'folio', id, { amount: dto.amount, paymentMode: dto.paymentMode }, user.workerId && user.workerName ? { workerId: user.workerId, workerName: user.workerName } : undefined);
    return res;
  }

  @Get('bookings/:id/payments')
  @SkipRolesGuard()
  async getPayments(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.hotel.getPayments(id, user.businessId);
  }

  // ---------- Other revenue attached to a booking (booking charges) ----------

  @Get('revenue-categories')
  @SkipRolesGuard()
  async listRevenueCategories(@CurrentUser() user: any) {
    return this.otherRevenue.listCategories(user.businessId);
  }

  @Get('bookings/:id/charges')
  @SkipRolesGuard()
  async getBookingCharges(@CurrentUser() user: any, @Param('id') id: string) {
    return this.otherRevenue.listOtherRevenue(user.businessId, { bookingId: id });
  }

  @Post('bookings/:id/charges')
  @SkipRolesGuard()
  async addBookingCharge(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddBookingChargeDto,
  ) {
    return this.otherRevenue.addOtherRevenue(user.businessId, {
      bookingId: id,
      categoryId: dto.categoryId,
      description: dto.description,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      date: new Date(dto.date),
      createdBy: user.sub,
    });
  }

  @Get('summary')
  @SkipRolesGuard()
  async getSummary(@CurrentUser() user: any) {
    return this.hotel.getRoomSummary(user.businessId, user.branchId);
  }
}
